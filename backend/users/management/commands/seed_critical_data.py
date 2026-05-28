"""
Django management command to seed critical data for AFN database.

Usage:
    python manage.py seed_critical_data
"""

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from datetime import timedelta, date
from django.contrib.auth import get_user_model
from decimal import Decimal

from services.models import (
    ServiceType, ServiceTicket, TechnicianSkill,
    InspectionChecklist, AfterSalesCase, MaintenanceSchedule
)

User = get_user_model()


class Command(BaseCommand):
    help = 'Seeds critical data for AFN Service Management System'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing data before seeding (DANGEROUS)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n' + '=' * 80))
        self.stdout.write(self.style.SUCCESS('CRITICAL DATA SEEDING - AFN Service Management'))
        self.stdout.write(self.style.SUCCESS('=' * 80 + '\n'))

        try:
            # Phase 1: Technicians
            self.create_technicians()

            # Phase 2: Skills
            self.assign_skills()

            # Phase 3: Checklists
            self.populate_checklists()

            # Phase 4: After-Sales Cases
            self.create_after_sales_cases()

            # Phase 5: Maintenance Schedules
            self.create_maintenance_schedules()

            # Summary
            self.print_summary()

        except Exception as e:
            raise CommandError(f'Error during seeding: {str(e)}')

    def create_technicians(self):
        self.stdout.write(self.style.WARNING('\n[1/5] Creating 3 additional technicians...'))

        technicians = [
            {
                'username': 'tech2',
                'email': 'tech2@afn.local',
                'first_name': 'Ahmed',
                'last_name': 'Hassan',
                'phone': '+27123456702',
            },
            {
                'username': 'tech3',
                'email': 'tech3@afn.local',
                'first_name': 'Nomsa',
                'last_name': 'Khumalo',
                'phone': '+27123456703',
            },
            {
                'username': 'tech4',
                'email': 'tech4@afn.local',
                'first_name': 'James',
                'last_name': 'Wilson',
                'phone': '+27123456704',
            },
        ]

        for tech_data in technicians:
            username = tech_data['username']
            if User.objects.filter(username=username).exists():
                tech = User.objects.get(username=username)
                tech.is_available = True
                tech.save()
                self.stdout.write(f"  ✓ {username} already exists (updated is_available=True)")
            else:
                tech = User.objects.create_user(
                    username=username,
                    email=tech_data['email'],
                    first_name=tech_data['first_name'],
                    last_name=tech_data['last_name'],
                    phone=tech_data['phone'],
                    role='technician',
                    status='active',
                    is_available=True,
                    password='Tech@2024'
                )
                self.stdout.write(self.style.SUCCESS(f"  ✓ Created {username}"))

        # Mark existing technician as available
        try:
            tech1 = User.objects.get(username='TechIman')
            tech1.is_available = True
            tech1.save()
            self.stdout.write(f"  ✓ TechIman marked as available")
        except User.DoesNotExist:
            pass

        total = User.objects.filter(role='technician', status='active').count()
        self.stdout.write(self.style.SUCCESS(f"  TOTAL: {total} active technicians\n"))

    def assign_skills(self):
        self.stdout.write(self.style.WARNING('[2/5] Assigning skills to technicians...'))

        all_technicians = User.objects.filter(role='technician', status='active')
        all_service_types = ServiceType.objects.all()[:3]

        if not all_service_types.exists():
            self.stdout.write(self.style.WARNING("  ⚠ No service types found. Skipping.\n"))
            return

        for tech in all_technicians:
            for i, service in enumerate(all_service_types):
                skill_level = 'expert' if i == 0 else ('intermediate' if i == 1 else 'beginner')
                TechnicianSkill.objects.get_or_create(
                    technician=tech,
                    service_type=service,
                    defaults={'skill_level': skill_level}
                )
            self.stdout.write(f"  ✓ {tech.username} assigned {all_service_types.count()} skills")

        self.stdout.write(self.style.SUCCESS(f"  TOTAL: {TechnicianSkill.objects.count()} skills assigned\n"))

    def populate_checklists(self):
        self.stdout.write(self.style.WARNING('[3/5] Populating inspection checklists...'))

        tickets_without_checklist = ServiceTicket.objects.filter(inspection__isnull=True)
        count = 0

        for ticket in tickets_without_checklist:
            try:
                InspectionChecklist.objects.create(
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
                    completed_by=ticket.technician,
                    submitted_by=ticket.technician,
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
                self.stdout.write(f"  ✓ Checklist for ticket #{ticket.id}")
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  ✗ Error for ticket #{ticket.id}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS(f"  TOTAL: {count} checklists created\n"))

    def create_after_sales_cases(self):
        self.stdout.write(self.style.WARNING('[4/5] Creating after-sales cases...'))

        # Get or create an admin workspace owner for after-sales cases.
        try:
            after_sales_owner = User.objects.filter(role__in=['superadmin', 'admin'], status='active').order_by('id').first()
            if after_sales_owner is None:
                raise User.DoesNotExist
        except User.DoesNotExist:
            after_sales_owner = User.objects.create_user(
                username='aftersales_admin',
                email='aftersales-admin@afn.local',
                first_name='Support',
                last_name='Team',
                role='admin',
                status='active',
                password='FollowUp@2024'
            )
            self.stdout.write(self.style.SUCCESS(f"  ✓ Created after-sales admin user"))

        # Create cases for completed tickets
        completed_tickets = ServiceTicket.objects.filter(status='Completed')
        case_types = ['warranty', 'follow_up', 'feedback', 'maintenance']
        priorities = ['normal', 'high', 'low']
        count = 0

        for i, ticket in enumerate(completed_tickets):
            try:
                case_type = case_types[i % len(case_types)]
                priority = priorities[i % len(priorities)]

                AfterSalesCase.objects.create(
                    service_ticket=ticket,
                    client=ticket.request.client,
                    assigned_to=after_sales_owner,
                    created_by=ticket.technician,
                    case_type=case_type,
                    status='open',
                    priority=priority,
                    creation_source='completion_flow',
                    summary=f"{case_type.title()} case for ticket #{ticket.id}",
                    details=f"Automatically created from completed service ticket #{ticket.id}.",
                    due_date=date.today() + timedelta(days=7),
                )
                count += 1
                self.stdout.write(f"  ✓ {case_type} case for ticket #{ticket.id}")
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  ✗ Error for ticket #{ticket.id}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS(f"  TOTAL: {count} cases created\n"))

    def create_maintenance_schedules(self):
        self.stdout.write(self.style.WARNING('[5/5] Creating maintenance schedules...'))

        installation_type = ServiceType.objects.filter(name__icontains='install').first()

        if not installation_type:
            self.stdout.write(self.style.WARNING("  ⚠ No installation service type found\n"))
            return

        tickets = ServiceTicket.objects.filter(
            status='Completed',
            maintenance_schedule__isnull=True
        )[:5]

        profiles = ['commercial_area', 'dust_free_area', 'standard_area']
        count = 0

        for i, ticket in enumerate(tickets):
            try:
                profile = profiles[i % len(profiles)]
                interval_days = 90 if profile == 'standard_area' else (60 if profile == 'commercial_area' else 45)

                MaintenanceSchedule.objects.create(
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
                count += 1
                self.stdout.write(f"  ✓ {interval_days}-day schedule for ticket #{ticket.id}")
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  ✗ Error for ticket #{ticket.id}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS(f"  TOTAL: {count} schedules created\n"))

    def print_summary(self):
        self.stdout.write(self.style.SUCCESS('=' * 80))
        self.stdout.write(self.style.SUCCESS('SUMMARY'))
        self.stdout.write(self.style.SUCCESS('=' * 80 + '\n'))

        active_techs = User.objects.filter(role='technician', status='active').count()
        available_techs = User.objects.filter(role='technician', status='active', is_available=True).count()
        checklists = ServiceTicket.objects.filter(inspection__isnull=False).count()
        total_tickets = ServiceTicket.objects.count()
        after_sales = AfterSalesCase.objects.count()
        maintenance = MaintenanceSchedule.objects.count()
        skills = TechnicianSkill.objects.count()

        self.stdout.write(f"✓ Active Technicians: {active_techs}")
        self.stdout.write(f"✓ Available Technicians: {available_techs}")
        self.stdout.write(f"✓ Tickets with Checklists: {checklists} / {total_tickets}")
        self.stdout.write(f"✓ After-Sales Cases: {after_sales}")
        self.stdout.write(f"✓ Maintenance Schedules: {maintenance}")
        self.stdout.write(f"✓ Technician Skills: {skills}")

        self.stdout.write(self.style.SUCCESS('\n' + '=' * 80))
        self.stdout.write(self.style.SUCCESS('DATABASE SEEDING COMPLETE'))
        self.stdout.write(self.style.SUCCESS('=' * 80 + '\n'))
