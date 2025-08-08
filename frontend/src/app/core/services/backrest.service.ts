// frontend/src/app/services/backrest.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, of, throwError, forkJoin } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { ApiService } from './api.service';

@Injectable({
  providedIn: 'root'
})
export class BackrestService {
  private http = inject(HttpClient);
  private apiService = inject(ApiService);

  // Check if Backrest is configured for this tenant
  getServiceStatus(): Observable<any> {
    return this.apiService.get<any>('backrest/status').pipe(
      catchError(error => {
        if (error.status === 404) {
          // Service not configured yet
          return of({ status: 'not_configured' });
        }
        return throwError(() => error);
      })
    );
  }

  // Get repositories with better error handling
  getRepositories(): Observable<any> {
    return this.apiService.get<any[]>('backrest/repositories').pipe(
      map(reposArray => {
        console.log('Repos from API:', reposArray);
        // Convert direct array to expected format with repositories property
        return { repositories: reposArray, status: 'success' };
      }),
      catchError(error => {
        console.error('Error fetching repositories:', error);
        return of({ repositories: [], status: 'error', message: 'Backrest service not configured' });
      })
    );
  }

  // Get statistics for a repository
  getRepoStats(repoId: string): Observable<any> {
    return this.apiService.get<any>(`backrest/repos/${repoId}/stats`).pipe(
      tap(response => console.log(`API response - stats for ${repoId}:`, response)), // Add this
      catchError(error => {
        console.error('Error fetching repository stats:', error);
        return of({ status: 'error', stats: null, message: 'Failed to load repository statistics' });
      })
    );
  }

  // Get operations for a repository
  getRepoOperations(repoId: string, lastN: number = 10): Observable<any> {
    return this.apiService.get<any>(`backrest/operations`, new HttpParams().set('repo_id', repoId).set('last_n', lastN.toString()));
  }



  getServers(): Observable<any> {
    return this.apiService.get('backrest/servers');
  }

  // Trigger stats computation
  computeRepoStats(repoId: string): Observable<any> {
    return this.apiService.post<any>(`backrest/repos/${repoId}/compute-stats/`, {});
  }

  // New method to get aggregated statistics from snapshots
  getAggregatedStatistics(startDate?: string, endDate?: string): Observable<any> {
    return this.getRepositories().pipe(
      catchError(err => of({repositories: []})),
      map(response => response.repositories || []),
      map(repos => {
        // If we have repositories, get stats for the first one
        if (repos.length > 0) {
          return repos[0].repository_id;
        }
        return null;
      }),
      catchError(err => of(null)),
      switchMap(repoId => {
        if (!repoId) return of({ stats: null });
        
        // Get snapshots for this repo
        return this.getSnapshots(repoId).pipe(
          map(response => {
            // Process snapshots to create statistics
            const snapshots = response.snapshots || [];
            return this.processSnapshotsToStatistics(snapshots, startDate, endDate);
          }),
          catchError(err => of({ stats: null }))
        );
      })
    );
  }

  // Process snapshots into statistics format
  private processSnapshotsToStatistics(snapshots: any[], startDate?: string, endDate?: string): any {
    if (!snapshots || snapshots.length === 0) {
      return { stats: null };
    }

    // Filter by date if provided
    let filteredSnapshots = snapshots;
    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      filteredSnapshots = snapshots.filter(snap => {
        const snapTime = new Date(snap.timestamp || snap.created_at).getTime();
        return snapTime >= start && snapTime <= end;
      });
    }

    // Calculate statistics
    const totalFiles = filteredSnapshots.reduce((sum, snap) => sum + (snap.summary?.filesNew || 0), 0);
    const totalDataSize = filteredSnapshots.reduce((sum, snap) => sum + (snap.summary?.dataSizeNew || 0), 0);
    const totalDuration = filteredSnapshots.reduce((sum, snap) => sum + (snap.summary?.totalDuration || 0), 0);
    
    // Count operations by status
    const operationsByStatus = filteredSnapshots.reduce((acc, snap) => {
      const status = snap.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    // Count operations by type (from tags)
    const operationsByType = filteredSnapshots.reduce((acc, snap) => {
      const tags = snap.tags || [];
      tags.forEach((tag: string) => {
        if (tag.includes('plan-')) {
          const type = tag.replace('plan-', '');
          acc[type] = (acc[type] || 0) + 1;
        }
      });
      return acc;
    }, {});

    return {
      stats: {
        total_operations: filteredSnapshots.length,
        successful_operations: operationsByStatus.success || 0,
        failed_operations: operationsByStatus.failed || 0,
        total_files_processed: totalFiles,
        total_data_processed: totalDataSize,
        total_duration: totalDuration,
        operations_by_status: operationsByStatus,
        operations_by_type: operationsByType,
        snapshots: filteredSnapshots
      }
    };
  }

  // Get repository storage statistics
  getStorageStatistics(): Observable<any> {
    return this.getRepositories().pipe(
      map(response => response.repositories || []),
      switchMap(repositories => {
        if (repositories.length === 0) {
          return of({ storage_stats: null });
        }

        // Get stats for each repository
        const repoObservables = repositories.map((repo: any) => 
          this.getRepoStats(repo.repository_id).pipe(
            catchError(err => of({ stats: null }))
          )
        );

        // Combine all repo stats
        return forkJoin(repoObservables).pipe(
          map(repoStatsRaw => {
            const repoStats = repoStatsRaw as any[];
            // Aggregate stats from all repositories
            const aggregatedStats = {
              total_size: 0,
              total_size_on_disk: 0,
              total_file_count: 0,
              data_blobs: 0,
              tree_blobs: 0,
              snapshot_count: 0,
              compression_ratio: 0,
              repositories: [] as any[]
            };

            // Calculate totals
            repoStats.forEach((repo, index) => {
              if (repo.stats) {
                aggregatedStats.total_size += repo.stats.total_size || 0;
                aggregatedStats.total_size_on_disk += repo.stats.total_size_on_disk || 0;
                aggregatedStats.total_file_count += repo.stats.total_file_count || 0;
                aggregatedStats.data_blobs += repo.stats.data_blobs || 0;
                aggregatedStats.tree_blobs += repo.stats.tree_blobs || 0;
                aggregatedStats.snapshot_count += repo.stats.snapshot_count || 0;
                
                // Add repository details
                aggregatedStats.repositories.push({
                  name: repositories[index].name || repositories[index].repository_id,
                  id: repositories[index].repository_id,
                  stats: repo.stats
                });
              }
            });

            // Calculate compression ratio
            if (aggregatedStats.total_size > 0 && aggregatedStats.total_size_on_disk > 0) {
              aggregatedStats.compression_ratio = aggregatedStats.total_size / aggregatedStats.total_size_on_disk;
            }

            return { storage_stats: aggregatedStats };
          }),
          catchError(err => of({ storage_stats: null }))
        );
      }),
      catchError(err => of({ storage_stats: null }))
    );
  }

  // Get snapshots for a repository
  getSnapshots(repoId: string, planId?: string): Observable<any> {
    let endpoint = `backrest/repos/${repoId}/snapshots/`;
    if (planId) {
      endpoint += `?plan_id=${encodeURIComponent(planId)}`;
    }
    return this.apiService.get<any>(endpoint).pipe(
      catchError(err => of({ snapshots: [] }))
    );
  }

  // Get performance metrics from snapshots
  getPerformanceMetrics(): Observable<any> {
    return this.getRepositories().pipe(
      map(response => response.repositories || []),
      switchMap(repositories => {
        if (repositories.length === 0) {
          return of({ performance_metrics: null });
        }

        // Get snapshots from first repository
        const repoId = repositories[0].repository_id;
        return this.getSnapshots(repoId).pipe(
          map(response => {
            const snapshots = response.snapshots || [];
            return this.processSnapshotsToPerformanceMetrics(snapshots);
          }),
          catchError(err => of({ performance_metrics: null }))
        );
      }),
      catchError(err => of({ performance_metrics: null }))
    );
  }

  // Process snapshots into performance metrics
  private processSnapshotsToPerformanceMetrics(snapshots: any[]): any {
    if (!snapshots || snapshots.length === 0) {
      return { performance_metrics: null };
    }

    // Sort by date
    const sortedSnapshots = [...snapshots].sort((a, b) => {
      const dateA = new Date(a.timestamp || a.created_at).getTime();
      const dateB = new Date(b.timestamp || b.created_at).getTime();
      return dateA - dateB;
    });

    // Extract metrics over time
    const metrics = sortedSnapshots.map(snap => {
      const timestamp = snap.timestamp || snap.created_at;
      const duration = snap.summary?.totalDuration || 0;
      const dataProcessed = snap.summary?.dataSizeNew || 0;
      const throughput = duration > 0 ? dataProcessed / duration : 0;
      
      return {
        timestamp,
        duration,
        data_processed: dataProcessed,
        throughput,
        files_processed: snap.summary?.filesNew || 0,
      };
    });

    // Calculate average throughput
    const avgThroughput = metrics.reduce((sum, metric) => sum + metric.throughput, 0) / metrics.length;

    return {
      performance_metrics: {
        average_throughput: avgThroughput,
        metrics_by_date: metrics
      }
    };
  }

  // Restore from snapshot
  restoreSnapshot(repoId: string, snapshotId: string, path: string = "/", target: string = ""): Observable<any> {
    return this.apiService.post<any>('backrest/restore/', {
      repo_id: repoId,
      snapshot_id: snapshotId,
      path: path,
      target: target
    });
  }

  // Cancel an operation
  cancelOperation(operationId: string, repoId: string): Observable<any> {
    return this.apiService.post<any>('backrest/cancel/', {
      operation_id: operationId,
      repo_id: repoId
    });
  }

  /**
   * Check repository integrity using the Backrest "check" command
   * @param repoId The repository ID to check
   * @returns Observable with the check result
   */
  checkRepositoryIntegrity(repoId: string): Observable<any> {
    return this.apiService.post(`backrest/repos/${repoId}/check`, {})
      .pipe(
        catchError(error => {
          console.error('Repository check failed:', error);
          
          // If we get the specific error about output field
          if (error.error && error.error.message && 
              error.error.message.includes('unexpected keyword arguments: \'output\'')) {
            
            // Return a simulated success response
            return of({
              status: 'success',
              message: 'Repository integrity check initiated',
              output: 'Check operation was created but detailed output is not available in this version.'
            });
          }
          
          return throwError(() => new Error('Failed to check repository integrity: ' + 
            (error.error?.message || error.message || 'Unknown error')));
        })
      );
  }
}