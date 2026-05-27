"""
API URL Configuration.
Clean routing — all business logic lives in view modules.
"""
from django.urls import path, include
from rest_framework import routers

from services.views_dashboard import AdminCalendarView, DashboardView
from services.views import (
    TechnicianDashboardView, TechnicianJobsView, TechnicianScheduleView,
    TechnicianProfileView, TechnicianHistoryView,
)
from users.views import (
    AdminTechniciansViewSet, AdminClientsViewSet, AdminUsersViewSet,
    AdminSettingsViewSet, AdminServicesViewSet, AdminAnalyticsViewSet,
    AdminActivityLogViewSet,
)
from api.views import checklist_view, geocode_reverse_view, geocode_search_view, tracking_view


# Admin router
admin_router = routers.DefaultRouter()
admin_router.register(r'technicians', AdminTechniciansViewSet, basename='admin-technicians')
admin_router.register(r'clients', AdminClientsViewSet, basename='admin-clients')
admin_router.register(r'users', AdminUsersViewSet, basename='admin-users')
admin_router.register(r'settings', AdminSettingsViewSet, basename='admin-settings')
admin_router.register(r'services', AdminServicesViewSet, basename='admin-services')
admin_router.register(r'analytics', AdminAnalyticsViewSet, basename='admin-analytics')
admin_router.register(r'activity-logs', AdminActivityLogViewSet, basename='admin-activity-logs')

urlpatterns = [
    # Tracking
    path('tracking', tracking_view, name='tracking-no-slash'),
    path('tracking/', tracking_view, name='tracking'),
    path('geocode/search/', geocode_search_view, name='geocode-search'),
    path('geocode/reverse/', geocode_reverse_view, name='geocode-reverse'),

    # App routes
    path('users/', include('users.urls')),
    path('services/', include('services.urls')),
    path('messages/', include('messages_app.urls')),
    path('notifications/', include('notifications.urls')),
    path('inventory/', include('inventory.urls')),
    path('progress/', include('progress.urls')),
    path('history/', include('history.urls')),

    # Dashboard
    path('dashboard/stats/', DashboardView.as_view(), name='dashboard-stats'),
    path('admin/calendar/', AdminCalendarView.as_view(), name='admin-calendar'),

    # Technician endpoints
    path('technician/dashboard/', TechnicianDashboardView.as_view({'get': 'dashboard'}), name='technician-dashboard'),
    path('technician/jobs/', TechnicianJobsView.as_view({'get': 'list'}), name='technician-jobs'),
    path('technician/jobs/<int:pk>/', TechnicianJobsView.as_view({'get': 'retrieve'}), name='technician-job-detail'),
    path('technician/jobs/<int:pk>/status/', TechnicianJobsView.as_view({'post': 'update_status'}), name='technician-job-status'),
    path('technician/schedule/', TechnicianScheduleView.as_view({'get': 'list'}), name='technician-schedule'),
    path('technician/profile/', TechnicianProfileView.as_view({'get': 'list', 'put': 'update'}), name='technician-profile'),
    path('technician/history/', TechnicianHistoryView.as_view({'get': 'list'}), name='technician-history'),

    # Checklist
    path('checklist/', checklist_view, name='checklist-create'),

    # Admin
    path('admin/settings/', AdminSettingsViewSet.as_view({'get': 'list', 'put': 'update'}), name='admin-settings-root'),
    path('admin/', include(admin_router.urls)),
]
