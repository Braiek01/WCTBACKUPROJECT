# WCBACKUPROJECT
Project Title : Designing and Building a Backup and Restoration Solution for Servers 

## Project Description:
Backup & Restore Platform:
A robust platform designed to back up and restore server data. The system will provide users with a web portal for user and tenant management (with custom domain support) and a core backup/restore engine that supports various backup types


### Architecture (Monolith)
*	Monolithic Design:

### All components reside within a single Django project. This includes:
*	Web Portal: Handles user signup/login, tenant creation, and custom domain management.
*	Backup Platform: Implements full, incremental, and differential backup operations, restoration processes, and simulation modes.
*	Shared Services: Security (JWT, SSL, AES-256 encryption), multi-tenancy (using django-tenants), and monitoring (via ELK Stack).

### Tech Stack
•	Backend:
  *	Django (Python)
* Django REST Framework

•	Database:
  *	PostgreSQL (for metadata with multi-tenancy using django-tenants)
  *	Local File System / Azure Blob Storage (for storing actual backups; Azure Blob via MinIO integration)


•	Task Queue:
  * Celery (for background task processing)
  * Redis (as the broker)
  * django-celery-beat (for scheduling periodic tasks)

• Frontend:	Angular 17Chart.js (for statistics visualization)PrimeNG (for UI components)


•	Monitoring & Logging:
*	ELK Stack (Elasticsearch, Logstash, Kibana for logging, metrics, and dashboards)


•	Security:
* JWT Authentication
* SHA-256 For Backup Integrity
* SSH Key Integration


•	Multi-tenancy:
*	django-tenants


•	Automation:
*	Ansible (for server configuration management and backup restoration automation


•	Version Control :
*	Git




### FEATURES FOR THE MVP : 
A. User & Tenant Management
•	Signup & Login:
*	User authentication via JWT.
*	On signup, automatically create a new tenant (Client) and assign a custom domain.

•	Multi-tenancy:
*	Isolate tenant data using django-tenants with a public schema for shared data and tenant schemas for isolated backup data.

B. Backup Operations
•	Backup Types:
*	Full Backup: A complete copy of the server data.
*	Incremental Backup: Backs up only changes since the last backup. (LATER)
*	Differential Backup: Backs up differences since the last full backup.

•	Restoration:
*	Retrieve and restore backup files.

•	Integrity Checks:
*	Use SHA-256 to verify backup data integrity.

C. Task Scheduling & Execution
•	Celery Tasks:
*	full_backup: Task to perform full backups, compute integrity, save backups, and log metadata.
*	cleanup_monthly_backups: Task to remove redundant backups at the start of a new cycle.
*	sync_storage: Task to synchronize backup files between local storage and Azure Blob.

•	Periodic Scheduling:
*	Schedule full backups every Monday, differential backups during the week, and monthly cleanup that retains only the latest full backup for the prior month.

D. Storage Integration
•	Abstract Storage Interface:
*	Defines methods: save(), retrieve(), and delete().

•	Implementations:
*	LocalStorageBackend: Manages backups on the local file system (and supports MinIO).
*	AzureBlobStorageBackend: Manages backups on Azure Blob storage.

•	Automatic Syncing:
*	Periodic tasks to keep backup files synchronized between storage locations.

E. Logging & Monitoring
•	Logging:
*	JSON-formatted logs forwarded to the ELK Stack.

•	Monitoring:
*	Visualize backup metrics (backup type, date/time, user, storage location, file size, integrity check, server identifier) via Kibana dashboards.

•	Alerts:
*	Set up alerts for failed backups or storage issues.

F. Simulation & Dry-Run
•	Backup Simulation:
*	Dry-run mode to test backup operations without actual data storage.
* Generate mock statistics and simulate backup flows for testing purposes.

G. Security & Compliance
•	Security Measures:
*	Enforce JWT, SSL and SSH key management.

•	GDPR Compliance:
*	Ensure data minimization, clear privacy policies, and support for data erasure requests.

H. Ansible Integration
•	Automation:
*	Use Ansible playbooks for server configuration management.
*	Automate backup restoration and database recovery procedures.


### SEQUENCE DIAGRAM FOR A BASIC NO SCHEDULE BACKUP RUN : 
![Screenshot 2025-02-20 111022](https://github.com/user-attachments/assets/ac1778c9-3e98-4b8f-834c-08225888b4c5)










