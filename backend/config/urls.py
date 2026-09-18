from django.contrib import admin
from django.urls import path, re_path
from django.views.generic import TemplateView, RedirectView
from reports import views
from reports import management_api as management
from reports import test_site
from reports import local_preview

urlpatterns = [
    path('admin/login/', RedirectView.as_view(url='/', permanent=False)),
    path('admin/', RedirectView.as_view(url='/management', permanent=False)),
    path('technical-admin/', admin.site.urls),
    path('api/session/', views.session), path('api/login/', views.sign_in), path('api/logout/', views.sign_out),
    path('api/employee-link/login/', views.employee_link_login),
    path('api/local-preview/login/', local_preview.enter),
    path('api/local-preview/stores/', local_preview.create_store),
    path('api/dashboard/', views.dashboard), path('api/reports/<int:pk>/', views.report_detail),
    path('api/findings/<int:pk>/action/', views.finding_action), path('api/export/', views.export_csv),
    path('api/table-export/', views.export_table),
    path('api/reports/<int:pk>/question/', views.report_question),
    path('api/health/', views.health),
    path('api/test-site/', test_site.status),
    path('api/test-site/start/', test_site.start),
    path('api/manage/', management.overview),
    path('api/manage/stores/<int:pk>/', management.save_store),
    path('api/manage/employees/<int:pk>/', management.save_employee),
    path('api/manage/stores/<int:pk>/archive/', management.archive_store),
    path('api/manage/employees/<int:pk>/archive/', management.archive_employee),
    path('api/manage/employees/<int:pk>/access/', management.employee_access),
    path('api/manage/legal/<int:pk>/', management.save_legal),
    path('api/manage/plans/', management.plans),
    path('api/manage/sheets/<int:pk>/', management.source_sheet),
    path('api/manage/issues/<int:pk>/', management.resolve_issue),
    path('api/manage/password/', management.change_password),
    path('api/manage/schedule/', management.schedule_exceptions),
    path('api/manage/reports/', management.create_report),
    re_path(r'^(?!api/|admin/|static/|assets/).*$', TemplateView.as_view(template_name='index.html')),
]
