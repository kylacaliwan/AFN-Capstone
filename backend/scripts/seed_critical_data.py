"""
CRITICAL DATA SEEDING SCRIPT
Populates database with essential data to enable core workflows.

Usage:
    cd backend
    python manage.py shell < scripts/seed_critical_data.py

Or in Django shell:
    exec(open('scripts/seed_critical_data.py').read())
"""

import os
import django
from datetime import date, datetime, timedelta
from decimal import Decimal

# Setup Django if running standalone
if __name__ == "__main__":
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'afn_service_management.settings')
    django.setup()

from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction

from users.models import User
from services.models import (
    ServiceType, ServiceTicket, TechnicianSkill,
    InspectionChecklist, AfterSalesCase, MaintenanceSchedule
)
from notifications.models import Notification
from messages_app.models import Message
from progress.models import TicketProgress

User = get_user_model()

print("=" * 80)
print("CRITICAL DATA SEEDING - AFN Service Management")
print("=" * 80)

# ============================================================================
# PHASE 1: CREATE ADDITIONAL TECHNICIANS (3 more to reach 4 total)
# ============================================================================

print("\n[1/5] Creating 3 additional technicians...")

technicians_to_create = [
    {
        'username': 'tech2',
        'email': 'tech2@afn.local',
        'first_name': 'Ahmed',
        'last_name': 'Hassan',
        'password': 'Tech@2024',
        'phone': '+27123456702',
        'role': 'technician',
        'status': 'active',
        'is_available': True,
    },
    {
        'username': 'tech3',
        'email': 'tech3@afn.local',
        'first_name': 'Nomsa',
        'last_name': 'Khumalo',
        'password': 'Tech@2024',
        'phone': '+27123456703',
        'role': 'technician',
        'status': 'active',
        'is_available': True,
    },
    {
        'username': 'tech4',
        'email': 'tech4@afn.local',
        'first_name': 'James',
        'last_name': 'Wilson',
        'password': 'Tech@2024',
        'phone': '+27123456704',
        'role': 'technician',
        'status': 'active',
        'is_available': True,
    },
]

created_techs = []
for tech_data in technicians_to_create:
    username = tech_data['username']
    if User.objects.filter(username=username).exists():
        tech = User.objects.get(username=username)
        tech.is_available = True
        tech.save()
        print(f"  ✓ {username} already exists (updated is_available=True)")
        created_techs.append(tech)
    else:
        password = tech_data.pop('password')
        tech = User.objects.create_user(**tech_data)
        tech.set_password(password)
        tech.save()
        print(f"  ✓ Created {username}")
        created_techs.append(tech)

# Mark the existing lone technician as available
try:
    tech1 = User.objects.get(username='TechIman')
    tech1.is_available = True
    tech1.save()
    print(f"  ✓ TechIman marked as available")
except User.DoesNotExist:
    pass

print(f"\n  TOTAL: {User.objects.filter(role='technician', status='active').count()} active technicians")

# ============================================================================
# PHASE 2: ASSIGN SKILLS TO TECHNICIANS
# ============================================================================

print("\n[2/5] Assigning skills to technicians...")

all_technicians = User.objects.filter(role='technician', status='active')
all_service_types = ServiceType.objects.all()

if all_service_types.count() == 0:
    print("  ⚠ No service types found. Skipping skill assignment.")
else:
    # Assign skills: each tech gets 3-4 random service types
    for tech in all_technicians:
        service_types = all_service_types[:3]  # First 3 service types
        for i, service in enumerate(service_types):
            skill_level = 'expert' if i == 0 else ('intermediate' if i == 1 else 'beginner')
            TechnicianSkill.objects.get_or_create(
                technician=tech,
                service_type=service,
                defaults={'skill_level': skill_level}
            )
        print(f"  ✓ {tech.username} assigned {service_types.count()} skills")

# ============================================================================
# PHASE 3: POPULATE INSPECTION CHECKLISTS FOR ALL TICKETS
# ============================================================================

print("\n[3/5] Populating inspection checklists...")

tickets_without_checklist = ServiceTicket.objects.filter(inspection__isnull=True)
count = 0

for ticket in tickets_without_checklist:
    try:
        checklist = InspectionChecklist.objects.create(
            ticket=ticket,
            site_accessible=True,
            site_accessible_notes="Site is accessible and safe",
            electrical_available=True,
            electrical_adequate=True,
            electrical_notes="Power supply adequate for operation",
            roof_condition="Good - no visible damage",
            structural_assessment="Structure is sound and supports installation",
            safety_equipment_present=True,
            safety_hazards="None observed - area cleared for work",
            recommendation="Approved",
            additional_notes="Installation can proceed as scheduled",
            is_completed=True,
            completed_at=timezone.now() - timedelta(days=5),
            completed_by=ticket.technician if ticket.technician else None,
            submitted_by=ticket.technician if ticket.technician else None,
            submitted_at=timezone.now() - timedelta(days=5),
            maintenance_required=True,
            maintenance_profile="standard_area",
            maintenance_interval_days=90,
            maintenance_notes="Standard 90-day maintenance schedule recommended",
            warranty_provided=True,
            warranty_period_days=365,
            warranty_notes="Full 1-year warranty on parts and labor",
        )
        count += 1
        print(f"  ✓ Checklist created for ticket #{ticket.id}")
    except Exception as e:
        print(f"  ✗ Error creating checklist for ticket #{ticket.id}: {str(e)}")

print(f"\n  TOTAL: {count} checklists created")

# ============================================================================
# PHASE 4: CREATE AFTER-SALES CASES
# ============================================================================

print("\n[4/5] Creating after-sales cases...")

# Get admin workspace owner for after-sales cases.
try:
    after_sales_owner = User.objects.filter(role__in=['superadmin', 'admin'], status='active').order_by('id').first()
    if after_sales_owner is None:
        raise User.DoesNotExist
except User.DoesNotExist:
    print("  ⚠ No follow_up user found. Creating one...")
    after_sales_owner = User.objects.create_user(
        username='aftersales_admin',
        email='aftersales-admin@afn.local',
        first_name='Support',
        last_name='Team',
        role='admin',
        status='active'
    )
    after_sales_owner.set_password('FollowUp@2024')
    after_sales_owner.save()
    print(f"  Created after-sales admin user: {after_sales_owner.username}")

# Create after-sales cases for completed tickets
completed_tickets = ServiceTicket.objects.filter(status='Completed')
cases_created = 0

case_types = ['warranty', 'follow_up', 'feedback', 'maintenance']
priorities = ['normal', 'high', 'low']

for i, ticket in enumerate(completed_tickets):
    try:
        case_type = case_types[i % len(case_types)]
        priority = priorities[i % len(priorities)]

        case = AfterSalesCase.objects.create(
            service_ticket=ticket,
            client=ticket.request.client,
            assigned_to=after_sales_owner,
            created_by=ticket.technician if ticket.technician else None,
            case_type=case_type,
            status='open',
            priority=priority,
            creation_source='completion_flow',
            summary=f"{case_type.title()} case for ticket #{ticket.id}",
            details=f"Automatically created from completed service ticket #{ticket.id}.",
            due_date=date.today() + timedelta(days=7),
        )
        cases_created += 1
        print(f"  ✓ Created {case_type} case for ticket #{ticket.id}")
    except Exception as e:
        print(f"  ✗ Error creating case for ticket #{ticket.id}: {str(e)}")

print(f"\n  TOTAL: {cases_created} after-sales cases created")

# ============================================================================
# PHASE 5: CREATE MAINTENANCE SCHEDULES
# ============================================================================

print("\n[5/5] Creating maintenance schedules...")

# Create maintenance schedules for installation-type services
installation_type = ServiceType.objects.filter(name__icontains='install').first()

if installation_type:
    completed_tickets_for_maintenance = ServiceTicket.objects.filter(
        status='Completed',
        maintenance_schedule__isnull=True
    )[:5]  # Limit to 5 for now

    schedules_created = 0
    profiles = ['commercial_area', 'dust_free_area', 'standard_area']

    for i, ticket in enumerate(completed_tickets_for_maintenance):
        try:
            profile = profiles[i % len(profiles)]
            interval_days = 90 if profile == 'standard_area' else 60 if profile == 'commercial_area' else 45

            schedule = MaintenanceSchedule.objects.create(
                service_ticket=ticket,
                client=ticket.request.client,
                service_type=installation_type,
                maintenance_profile=profile,
                interval_days=interval_days,
                follow_up_window_days=14,
                last_service_date=ticket.completed_date.date() if ticket.completed_date else date.today(),
                next_due_date=date.today() + timedelta(days=interval_days),
                notify_on_date=date.today() + timedelta(days=interval_days - 7),
                status='scheduled',
                maintenance_notes=f"Regular {profile.replace('_', ' ')} maintenance",
            )
            schedules_created += 1
            print(f"  ✓ Created {interval_days}-day {profile} schedule for ticket #{ticket.id}")
        except Exception as e:
            print(f"  ✗ Error creating schedule for ticket #{ticket.id}: {str(e)}")

    print(f"\n  TOTAL: {schedules_created} maintenance schedules created")
else:
    print("  ⚠ No installation service type found. Skipping maintenance schedule creation.")

# ============================================================================
# SUMMARY
# ============================================================================

print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)

print(f"\n✓ Active Technicians: {User.objects.filter(role='technician', status='active').count()}")
print(f"✓ Available Technicians: {User.objects.filter(role='technician', status='active', is_available=True).count()}")
print(f"✓ Tickets with Checklists: {ServiceTicket.objects.filter(inspection__isnull=False).count()} / {ServiceTicket.objects.count()}")
print(f"✓ After-Sales Cases: {AfterSalesCase.objects.count()}")
print(f"✓ Maintenance Schedules: {MaintenanceSchedule.objects.count()}")
print(f"✓ Technician Skills: {TechnicianSkill.objects.count()}")

print("\n" + "=" * 80)
print("NEXT STEPS")
print("=" * 80)
print("\n1. Test dispatch with new technicians:")
print("   - Navigate to Admin → Service Tickets → Dispatch Board")
print("   - Assign tickets to technicians (should see 3+ available)")
print("\n2. Test checklist workflow:")
print("   - As technician, start a ticket and complete checklist")
print("   - Verify warranty auto-activation on completion")
print("\n3. Test after-sales:")
print("   - Check Follow-Up Dashboard for new cases")
print("   - Verify case assignment and tracking")
print("\n4. Enable remaining features:")
print("   - Messaging: Already enabled ✓")
print("   - Progress tracking: Already enabled ✓")
print("   - Service history: Already enabled ✓")
print("\n" + "=" * 80)
