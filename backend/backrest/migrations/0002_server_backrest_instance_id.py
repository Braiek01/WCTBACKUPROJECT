# Generated by Django 5.1.9 on 2025-05-28 10:04

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('backrest', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='server',
            name='backrest_instance_id',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
