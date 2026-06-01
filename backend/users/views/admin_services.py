# Auto-split from users/views.py
from users.views.helpers import *  # noqa: F401,F403

class AdminServicesViewSet(viewsets.ViewSet):
    """ViewSet for admin service management"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    def list(self, request):
        """Get all service types"""
        services = ServiceType.objects.all()
        serializer = ServiceTypeSerializer(services, many=True)
        return Response(serializer.data)

    def create(self, request):
        """Create a new service type"""
        serializer = ServiceTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        """Get a specific service type"""
        try:
            service = ServiceType.objects.get(id=pk)
            serializer = ServiceTypeSerializer(service)
            return Response(serializer.data)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        """Update a service type"""
        try:
            service = ServiceType.objects.get(id=pk)
            serializer = ServiceTypeSerializer(service, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, pk=None):
        """Delete a service type"""
        try:
            service = ServiceType.objects.get(id=pk)
            service.delete()
            return Response({'message': 'Service deleted'}, status=status.HTTP_204_NO_CONTENT)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)


class AdminAnalyticsViewSet(viewsets.ViewSet):
    """ViewSet for admin analytics"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    FORECAST_WINDOW_DAYS = 7
    HISTORY_WINDOW_DAYS = 42
    RECENT_WINDOW_DAYS = 14
    FORECAST_JOBS_PER_TECHNICIAN = 5
    BUSIEST_MONTHS_WINDOW = 12
    BUSIEST_WEEKS_WINDOW = 12
    LOCATION_TREND_WINDOW_DAYS = 30
    ANALYTICS_LIST_LIMIT = 6

    def list(self, request):
        """Get descriptive and predictive analytics based on live system data."""
        today = timezone.now().date()

        # Get days parameter from query string, default to 30
        days = int(request.query_params.get('days', 30))
        days = max(7, min(365, days))  # Clamp between 7 and 365 days

        overview = self._build_overview(today, days)
        service_breakdown = self._build_service_breakdown(today, days)
        top_technician = self._build_top_technician(today, days)
        completion_trend = self._build_completion_trend(today, days)
        monthly_service_trend = self._build_monthly_service_trend(today, days)
        predictive_summary, service_forecasts, daily_forecast = self._build_predictive_analytics(today, days)
        busiest_months = self._build_busiest_months(today, days)
        busiest_weeks = self._build_busiest_weeks(today, days)
        top_requested_service_types = self._build_top_requested_service_types(service_breakdown)
        city_completion_trends, province_completion_trends = self._build_location_completion_trends(today, days)
        seasonal_inventory_demand = self._build_seasonal_inventory_demand(today, days)

        return Response({
            'generatedAt': timezone.now(),
            'analyticsPeriodDays': days,
            'overview': overview,
            'totalRequests': overview['totalRequests'],
            'completedRequests': overview['completedRequests'],
            'pendingRequests': overview['pendingRequests'],
            'activeUsers': overview['activeUsers'],
            'activeTechnicians': overview['activeTechnicians'],
            'availableTechnicians': overview['availableTechnicians'],
            'activeTechnicianAccounts': overview['activeTechnicianAccounts'],
            'avgResponseTime': overview['avgResponseTimeHours'],
            'avgCompletionTime': overview['avgCompletionTimeHours'],
            'totalRevenue': 0,
            'jobCountByService': service_breakdown,
            'topTech': top_technician,
            'completionTrend': completion_trend,
            'monthlyServiceTrend': monthly_service_trend,
            'predictiveSummary': predictive_summary,
            'serviceForecasts': service_forecasts,
            'dailyForecast': daily_forecast,
            'busiestMonths': busiest_months,
            'busiestWeeks': busiest_weeks,
            'topRequestedServiceTypes': top_requested_service_types,
            'cityCompletionTrends': city_completion_trends,
            'provinceCompletionTrends': province_completion_trends,
            'seasonalInventoryDemand': seasonal_inventory_demand,
        })

    def _build_overview(self, today, days=30):
        period_start = today - timezone.timedelta(days=days - 1)
        period_requests = ServiceRequest.objects.filter(
            request_date__date__gte=period_start,
            request_date__date__lte=today,
        )
        completed_tickets = ServiceTicket.objects.filter(
            status='Completed',
            completed_date__date__gte=period_start,
            completed_date__date__lte=today,
        )
        active_tickets = ServiceTicket.objects.filter(status__in=['Not Started', 'In Progress', 'On Hold'])
        assigned_tickets = ServiceTicket.objects.filter(
            assigned_at__isnull=False,
            assigned_at__date__gte=period_start,
            assigned_at__date__lte=today,
        ).select_related('request')
        available_technicians = User.objects.filter(
            role='technician',
            status='active',
            is_active=True,
            technician_profile__is_available=True,
        ).count()
        active_technician_accounts = User.objects.filter(
            role='technician',
            status='active',
            is_active=True,
        ).count()

        return {
            'totalRequests': period_requests.count(),
            'completedRequests': completed_tickets.values('request_id').distinct().count(),
            'pendingRequests': period_requests.filter(status='Pending').count(),
            'activeTickets': active_tickets.count(),
            'activeUsers': User.objects.filter(status='active', is_active=True).count(),
            'activeTechnicians': available_technicians,
            'availableTechnicians': available_technicians,
            'activeTechnicianAccounts': active_technician_accounts,
            'avgResponseTimeHours': self._average_response_time_hours(assigned_tickets),
            'avgCompletionTimeHours': self._average_completion_time_hours(
                completed_tickets.select_related('request')
            ),
        }

    def _average_response_time_hours(self, tickets):
        durations = []
        for ticket in tickets:
            if ticket.assigned_at and ticket.request and ticket.request.request_date:
                duration_hours = (
                    ticket.assigned_at - ticket.request.request_date
                ).total_seconds() / 3600
                if duration_hours >= 0:
                    durations.append(duration_hours)
        if not durations:
            return 0
        return round(sum(durations) / len(durations), 1)

    def _average_completion_time_hours(self, tickets):
        durations = []
        for ticket in tickets:
            if not ticket.completed_date or not ticket.start_time:
                continue
            duration_hours = (ticket.completed_date - ticket.start_time).total_seconds() / 3600
            if duration_hours >= 0:
                durations.append(duration_hours)
        if not durations:
            return 0
        return round(sum(durations) / len(durations), 1)

    def _build_service_breakdown(self, today, days=30):
        recent_start = today - timezone.timedelta(days=days - 1)
        breakdown = (
            ServiceRequest.objects.filter(
                request_date__date__gte=recent_start,
                request_date__date__lte=today,
            )
            .values('service_type_id', 'service_type__name')
            .annotate(
                count=Count('id'),
                completed_requests=Count('id', filter=Q(status='Completed'))
            )
            .order_by('-count', 'service_type__name')
        )

        return [
            {
                'id': row['service_type_id'],
                'name': row['service_type__name'] or 'Unknown Service',
                'count': row['count'],
                'recentRequests': row['count'],
                'completedRequests': row['completed_requests'],
            }
            for row in breakdown
        ]

    def _build_top_technician(self, today, days=30):
        recent_start = today - timezone.timedelta(days=days - 1)
        leaderboard = (
            ServiceTicket.objects.filter(
                status='Completed',
                technician__isnull=False,
                completed_date__date__gte=recent_start
            )
            .values('technician__username')
            .annotate(
                total_completed=Count('id'),
                avg_rating=Avg('client_rating')
            )
            .order_by('-total_completed', 'technician__username')
            .first()
        )

        if not leaderboard:
            return None

        return {
            'techName': leaderboard['technician__username'],
            'totalCompleted': leaderboard['total_completed'],
            'avgRating': round(leaderboard['avg_rating'], 1)
            if leaderboard['avg_rating'] is not None else None,
        }

    def _build_completion_trend(self, today, days=30):
        trend = []
        # Show up to 14 days or the full period, whichever is smaller
        trend_days = min(14, days)
        for offset in range(trend_days - 1, -1, -1):
            date = today - timezone.timedelta(days=offset)
            trend.append({
                'date': date.isoformat(),
                'label': date.strftime('%a'),
                'completedCount': ServiceTicket.objects.filter(
                    status='Completed',
                    completed_date__date=date
                ).count(),
            })
        return trend

    def _build_monthly_service_trend(self, today, days=30):
        def shift_month(month_start, offset):
            month_index = (month_start.month - 1) + offset
            year = month_start.year + (month_index // 12)
            month = (month_index % 12) + 1
            return month_start.replace(year=year, month=month, day=1)

        current_month_start = today.replace(day=1)
        # For 7-30 days, show current + previous month. For longer, show 6 months
        months_back = 1 if days <= 30 else 5
        first_month_start = shift_month(current_month_start, -months_back)

        buckets = {}
        for offset in range(6):
            month_start = shift_month(first_month_start, offset)
            buckets[month_start] = {
                'monthStart': month_start.isoformat(),
                'label': month_start.strftime('%b %Y'),
                'requestCount': 0,
                'completedCount': 0,
            }

        request_queryset = ServiceRequest.objects.filter(request_date__date__gte=first_month_start)
        completed_request_queryset = ServiceRequest.objects.filter(
            status='Completed',
            updated_at__date__gte=first_month_start,
        )

        for request_obj in request_queryset:
            request_dt = request_obj.request_date
            request_day = (
                timezone.localtime(request_dt).date()
                if timezone.is_aware(request_dt) else request_dt.date()
            )
            month_start = request_day.replace(day=1)
            if month_start not in buckets:
                continue

            buckets[month_start]['requestCount'] += 1

        for request_obj in completed_request_queryset:
            completion_dt = request_obj.updated_at or request_obj.request_date
            if completion_dt is None:
                continue

            completion_day = (
                timezone.localtime(completion_dt).date()
                if timezone.is_aware(completion_dt) else completion_dt.date()
            )
            month_start = completion_day.replace(day=1)
            if month_start not in buckets:
                continue

            buckets[month_start]['completedCount'] += 1

        monthly_service_trend = []
        for month_start in sorted(buckets.keys()):
            bucket = buckets[month_start]
            completion_rate = (
                (bucket['completedCount'] / bucket['requestCount']) * 100
                if bucket['requestCount'] else 0
            )
            monthly_service_trend.append({
                **bucket,
                'completionRate': round(completion_rate, 1),
            })

        return monthly_service_trend

    def _build_busiest_months(self, today, days=30):
        # For shorter periods, look back 3 months; for longer, look back 12 months
        months_back = 3 if days <= 30 else 12
        window_start = (today.replace(day=1) - timezone.timedelta(days=months_back * 31)).replace(day=1)
        buckets = defaultdict(lambda: {
            'monthStart': None,
            'label': '',
            'requestCount': 0,
            'completedCount': 0,
        })

        for request_obj in ServiceRequest.objects.filter(request_date__date__gte=window_start):
            request_dt = request_obj.request_date
            request_day = (
                timezone.localtime(request_dt).date()
                if timezone.is_aware(request_dt) else request_dt.date()
            )
            month_start = request_day.replace(day=1)
            bucket = buckets[month_start]
            bucket['monthStart'] = month_start.isoformat()
            bucket['label'] = month_start.strftime('%b %Y')
            bucket['requestCount'] += 1
            if request_obj.status == 'Completed':
                bucket['completedCount'] += 1

        busiest_months = []
        for month_start, bucket in buckets.items():
            completion_rate = (
                (bucket['completedCount'] / bucket['requestCount']) * 100
                if bucket['requestCount'] else 0
            )
            busiest_months.append({
                **bucket,
                'completionRate': round(completion_rate, 1),
                '_sort_month': month_start,
            })

        busiest_months.sort(
            key=lambda item: (-item['requestCount'], -item['_sort_month'].toordinal())
        )

        return [
            {key: value for key, value in item.items() if key != '_sort_month'}
            for item in busiest_months[:self.ANALYTICS_LIST_LIMIT]
        ]

    def _build_busiest_weeks(self, today, days=30):
        # For shorter periods, look back 4 weeks; for longer, look back 12 weeks
        weeks_back = 4 if days <= 30 else 12
        window_start = today - timezone.timedelta(days=(weeks_back * 7) - 1)
        buckets = defaultdict(lambda: {
            'weekStart': None,
            'weekEnd': None,
            'label': '',
            'requestCount': 0,
            'completedCount': 0,
        })

        for request_obj in ServiceRequest.objects.filter(request_date__date__gte=window_start):
            request_dt = request_obj.request_date
            request_day = (
                timezone.localtime(request_dt).date()
                if timezone.is_aware(request_dt) else request_dt.date()
            )
            week_start = request_day - timezone.timedelta(days=request_day.weekday())
            week_end = week_start + timezone.timedelta(days=6)
            bucket = buckets[week_start]
            bucket['weekStart'] = week_start.isoformat()
            bucket['weekEnd'] = week_end.isoformat()
            bucket['label'] = f"{week_start.strftime('%b %d')} - {week_end.strftime('%b %d')}"
            bucket['requestCount'] += 1
            if request_obj.status == 'Completed':
                bucket['completedCount'] += 1

        busiest_weeks = []
        for week_start, bucket in buckets.items():
            completion_rate = (
                (bucket['completedCount'] / bucket['requestCount']) * 100
                if bucket['requestCount'] else 0
            )
            busiest_weeks.append({
                **bucket,
                'completionRate': round(completion_rate, 1),
                '_sort_week': week_start,
            })

        busiest_weeks.sort(
            key=lambda item: (-item['requestCount'], -item['_sort_week'].toordinal())
        )

        return [
            {key: value for key, value in item.items() if key != '_sort_week'}
            for item in busiest_weeks[:self.ANALYTICS_LIST_LIMIT]
        ]

    def _build_top_requested_service_types(self, service_breakdown):
        top_services = []
        for service in service_breakdown[:self.ANALYTICS_LIST_LIMIT]:
            completion_rate = (
                (service['completedRequests'] / service['count']) * 100
                if service['count'] else 0
            )
            top_services.append({
                'serviceTypeId': service['id'],
                'serviceType': service['name'],
                'requestCount': service['count'],
                'recentRequests': service['recentRequests'],
                'completedCount': service['completedRequests'],
                'completionRate': round(completion_rate, 1),
            })
        return top_services

    def _build_location_completion_trends(self, today, days=30):
        # Use 30 days for location trends or full period if shorter
        trend_window = min(30, days)
        recent_start = today - timezone.timedelta(days=trend_window - 1)
        previous_start = recent_start - timezone.timedelta(days=trend_window)

        tickets = ServiceTicket.objects.select_related('request__location').filter(
            request__location__isnull=False
        )

        city_buckets = defaultdict(lambda: {
            'city': '',
            'totalTickets': 0,
            'completedCount': 0,
            'recentCompleted': 0,
            'previousCompleted': 0,
            'latestCompletedDate': None,
        })
        province_buckets = defaultdict(lambda: {
            'province': '',
            'totalTickets': 0,
            'completedCount': 0,
            'recentCompleted': 0,
            'previousCompleted': 0,
            'latestCompletedDate': None,
        })

        for ticket in tickets:
            try:
                location = ticket.request.location
            except Exception:
                continue

            city = (location.city or '').strip()
            province = (location.province or '').strip()
            bucket_targets = []

            if city and city.lower() != 'unspecified':
                bucket_targets.append((city_buckets, city, 'city'))
            if province and province.lower() != 'unspecified':
                bucket_targets.append((province_buckets, province, 'province'))

            for bucket_map, label, field_name in bucket_targets:
                bucket = bucket_map[label]
                bucket[field_name] = label
                bucket['totalTickets'] += 1

                if ticket.status != 'Completed' or not ticket.completed_date:
                    continue

                bucket['completedCount'] += 1
                completed_day = (
                    timezone.localtime(ticket.completed_date).date()
                    if timezone.is_aware(ticket.completed_date) else ticket.completed_date.date()
                )
                if completed_day >= recent_start:
                    bucket['recentCompleted'] += 1
                elif previous_start <= completed_day < recent_start:
                    bucket['previousCompleted'] += 1

                latest_completed = bucket['latestCompletedDate']
                if latest_completed is None or completed_day > latest_completed:
                    bucket['latestCompletedDate'] = completed_day

        def serialize_location_buckets(bucket_map, field_name):
            serialized = []
            for bucket in bucket_map.values():
                trend_delta = bucket['recentCompleted'] - bucket['previousCompleted']
                if trend_delta > 0:
                    trend_direction = 'up'
                elif trend_delta < 0:
                    trend_direction = 'down'
                else:
                    trend_direction = 'flat'

                completion_rate = (
                    (bucket['completedCount'] / bucket['totalTickets']) * 100
                    if bucket['totalTickets'] else 0
                )

                serialized.append({
                    field_name: bucket[field_name],
                    'totalTickets': bucket['totalTickets'],
                    'completedCount': bucket['completedCount'],
                    'completionRate': round(completion_rate, 1),
                    'recentCompleted': bucket['recentCompleted'],
                    'previousCompleted': bucket['previousCompleted'],
                    'trendDelta': trend_delta,
                    'trendDirection': trend_direction,
                    'latestCompletedDate': bucket['latestCompletedDate'].isoformat()
                    if bucket['latestCompletedDate'] else None,
                })

            serialized.sort(
                key=lambda item: (
                    -item['completedCount'],
                    -item['recentCompleted'],
                    item[field_name].lower(),
                )
            )
            return serialized[:self.ANALYTICS_LIST_LIMIT]

        return (
            serialize_location_buckets(city_buckets, 'city'),
            serialize_location_buckets(province_buckets, 'province'),
        )

    def _build_seasonal_inventory_demand(self, today, days=30):
        """Analyze historical inventory demand by category for the current season."""
        from inventory.models import InventoryTransaction, InventoryCategory
        from django.db.models import Sum, Count

        # Analyze the selected period for seasonal analysis
        season_start = today - timezone.timedelta(days=days - 1)

        try:
            # Get all inventory transactions from season period (usage/consumption)
            transactions = InventoryTransaction.objects.filter(
                created_at__date__gte=season_start,
                created_at__date__lte=today,
                transaction_type__in=['usage', 'consumption', 'depletion']
            ).select_related('item', 'item__category')

            # Group by category and sum quantities
            category_demand = {}
            item_demand = {}

            for transaction in transactions:
                quantity = abs(transaction.quantity)  # Make positive

                # By category
                cat_name = transaction.item.category.name if transaction.item.category else 'Uncategorized'
                if cat_name not in category_demand:
                    category_demand[cat_name] = {'quantity': 0, 'transactions': 0, 'items': set()}
                category_demand[cat_name]['quantity'] += quantity
                category_demand[cat_name]['transactions'] += 1
                category_demand[cat_name]['items'].add(transaction.item.name)

                # By item
                item_key = transaction.item.name
                if item_key not in item_demand:
                    item_demand[item_key] = {'quantity': 0, 'transactions': 0, 'category': cat_name}
                item_demand[item_key]['quantity'] += quantity
                item_demand[item_key]['transactions'] += 1

            # Sort categories by demand
            sorted_categories = sorted(
                [
                    {
                        'category': cat,
                        'quantity': stats['quantity'],
                        'transactions': stats['transactions'],
                        'itemCount': len(stats['items']),
                        'demand': 'High' if stats['quantity'] > 50 else 'Medium' if stats['quantity'] > 10 else 'Low'
                    }
                    for cat, stats in category_demand.items()
                ],
                key=lambda x: x['quantity'],
                reverse=True
            )

            # Sort items by demand (top 10)
            sorted_items = sorted(
                [
                    {
                        'item': item,
                        'category': stats['category'],
                        'quantity': stats['quantity'],
                        'transactions': stats['transactions'],
                        'demand': 'High' if stats['quantity'] > 20 else 'Medium' if stats['quantity'] > 5 else 'Low'
                    }
                    for item, stats in item_demand.items()
                ],
                key=lambda x: x['quantity'],
                reverse=True
            )[:10]

            return {
                'period': f'Past {days} days',
                'categoryDemand': sorted_categories,
                'topItems': sorted_items,
                'totalTransactions': len(transactions),
                'totalQuantityConsumed': sum(category_demand[cat]['quantity'] for cat in category_demand),
                'analysisDate': today.isoformat(),
            }
        except Exception as e:
            # Return empty if inventory app not available
            return {
                'period': f'Past {days} days',
                'categoryDemand': [],
                'topItems': [],
                'totalTransactions': 0,
                'totalQuantityConsumed': 0,
                'analysisDate': today.isoformat(),
                'error': str(e)
            }

    def _build_predictive_analytics(self, today, days=30):
        # Adjust window sizes based on selected period
        history_days = min(days, 42)  # Max 42 days for history
        recent_days = min(max(14, days // 2), 30)  # 50% of period or 14-30 days

        history_start = today - timezone.timedelta(days=history_days - 1)
        recent_start = today - timezone.timedelta(days=recent_days - 1)
        previous_start = recent_start - timezone.timedelta(days=recent_days)

        active_technicians = User.objects.filter(
            role='technician',
            status='active',
            is_active=True
        ).count()

        weekday_slots = {index: 0 for index in range(7)}
        current_date = history_start
        while current_date <= today:
            weekday_slots[current_date.weekday()] += 1
            current_date += timezone.timedelta(days=1)

        daily_forecast_map = {}
        for offset in range(1, self.FORECAST_WINDOW_DAYS + 1):
            forecast_date = today + timezone.timedelta(days=offset)
            daily_forecast_map[forecast_date] = {
                'date': forecast_date.isoformat(),
                'label': forecast_date.strftime('%a %d %b'),
                'predictedRequests': 0,
            }

        service_forecasts = []
        weighted_growth_total = 0
        weighted_growth_volume = 0

        for service_type in ServiceType.objects.order_by('name'):
            request_days = []
            history_requests = ServiceRequest.objects.filter(
                service_type=service_type,
                request_date__date__gte=previous_start,
                request_date__date__lte=today
            ).values_list('request_date', flat=True)

            for request_date in history_requests:
                localized = timezone.localtime(request_date) if timezone.is_aware(request_date) else request_date
                request_days.append(localized.date())

            weekday_counts = {index: 0 for index in range(7)}
            history_count = 0
            recent_count = 0
            previous_count = 0

            for request_day in request_days:
                if request_day >= history_start:
                    history_count += 1
                    weekday_counts[request_day.weekday()] += 1
                if request_day >= recent_start:
                    recent_count += 1
                elif request_day >= previous_start:
                    previous_count += 1

            history_daily_average = (
                history_count / self.HISTORY_WINDOW_DAYS if history_count else 0
            )
            recent_daily_average = (
                recent_count / self.RECENT_WINDOW_DAYS if recent_count else history_daily_average
            )
            previous_daily_average = (
                previous_count / self.RECENT_WINDOW_DAYS if previous_count else 0
            )

            if previous_daily_average > 0:
                growth_rate = (recent_daily_average - previous_daily_average) / previous_daily_average
            elif recent_daily_average > 0 and history_daily_average > 0:
                growth_rate = (recent_daily_average - history_daily_average) / history_daily_average
            elif recent_daily_average > 0:
                growth_rate = 0.25
            else:
                growth_rate = 0

            trend_factor = max(0.8, min(1.5, 1 + (growth_rate * 0.35)))
            per_day_predictions = []

            for offset in range(1, self.FORECAST_WINDOW_DAYS + 1):
                forecast_date = today + timezone.timedelta(days=offset)
                weekday = forecast_date.weekday()
                weekday_average = weekday_counts[weekday] / max(1, weekday_slots[weekday])

                if history_daily_average > 0 and weekday_average > 0:
                    weekday_factor = weekday_average / history_daily_average
                else:
                    weekday_factor = 1.12 if weekday == 0 else 0.9 if weekday >= 5 else 1.0

                raw_prediction = recent_daily_average * weekday_factor * trend_factor
                if history_count == 0 and recent_count == 0:
                    predicted_requests = 0
                elif raw_prediction < 1:
                    predicted_requests = 1
                else:
                    predicted_requests = int(round(raw_prediction))

                per_day_predictions.append(predicted_requests)
                daily_forecast_map[forecast_date]['predictedRequests'] += predicted_requests

            predicted_next_7_days = sum(per_day_predictions)
            available_technicians = (
                TechnicianSkill.objects.filter(
                    service_type=service_type,
                    technician__role='technician',
                    technician__status='active',
                    technician__is_active=True
                )
                .values('technician_id')
                .distinct()
                .count()
            )
            if available_technicians == 0:
                available_technicians = active_technicians

            recommended_technicians = (
                (predicted_next_7_days + self.FORECAST_JOBS_PER_TECHNICIAN - 1)
                // self.FORECAST_JOBS_PER_TECHNICIAN
                if predicted_next_7_days > 0 else 0
            )
            capacity_gap = max(0, recommended_technicians - available_technicians)

            if capacity_gap > 0:
                risk_level = 'high'
            elif growth_rate > 0.2 or (
                available_technicians > 0 and
                predicted_next_7_days > available_technicians * self.FORECAST_JOBS_PER_TECHNICIAN
            ):
                risk_level = 'medium'
            else:
                risk_level = 'low'

            confidence = 45
            if history_count:
                confidence += min(35, history_count)
            if previous_count and recent_count:
                confidence += 10
            confidence = min(92, confidence)

            service_forecasts.append({
                'serviceTypeId': service_type.id,
                'serviceType': service_type.name,
                'recentRequests': recent_count,
                'previousRequests': previous_count,
                'historyRequests': history_count,
                'averageDailyDemand': round(recent_daily_average, 2),
                'projectedGrowthRate': round(growth_rate * 100, 1),
                'predictedNext7Days': predicted_next_7_days,
                'availableTechnicians': available_technicians,
                'recommendedTechnicians': recommended_technicians,
                'capacityGap': capacity_gap,
                'confidence': confidence,
                'riskLevel': risk_level,
            })

            weighted_growth_total += growth_rate * predicted_next_7_days
            weighted_growth_volume += predicted_next_7_days

        risk_priority = {'high': 0, 'medium': 1, 'low': 2}
        service_forecasts.sort(
            key=lambda item: (
                risk_priority.get(item['riskLevel'], 3),
                -item['predictedNext7Days'],
                item['serviceType']
            )
        )

        daily_forecast = []
        for forecast_date in sorted(daily_forecast_map.keys()):
            entry = daily_forecast_map[forecast_date]
            predicted_requests = entry['predictedRequests']
            capacity_gap = max(0, predicted_requests - active_technicians)

            if capacity_gap > 0:
                demand_level = 'high'
            elif predicted_requests >= max(3, active_technicians):
                demand_level = 'medium'
            else:
                demand_level = 'low'

            daily_forecast.append({
                **entry,
                'capacityGap': capacity_gap,
                'demandLevel': demand_level,
            })

        total_predicted_requests = sum(item['predictedRequests'] for item in daily_forecast)
        recommended_technicians = (
            (total_predicted_requests + self.FORECAST_JOBS_PER_TECHNICIAN - 1)
            // self.FORECAST_JOBS_PER_TECHNICIAN
            if total_predicted_requests > 0 else 0
        )
        projected_growth_rate = (
            round((weighted_growth_total / weighted_growth_volume) * 100, 1)
            if weighted_growth_volume else 0
        )

        if recommended_technicians > active_technicians:
            staffing_pressure = 'high'
        elif recommended_technicians == active_technicians and recommended_technicians > 0:
            staffing_pressure = 'medium'
        else:
            staffing_pressure = 'low'

        busiest_day = max(
            daily_forecast,
            key=lambda item: item['predictedRequests'],
            default=None
        )
        top_risk_service = next(
            (item for item in service_forecasts if item['riskLevel'] == 'high'),
            service_forecasts[0] if service_forecasts else None
        )

        predictive_summary = {
            'forecastWindowDays': self.FORECAST_WINDOW_DAYS,
            'historyWindowDays': self.HISTORY_WINDOW_DAYS,
            'totalPredictedRequests': total_predicted_requests,
            'projectedGrowthRate': projected_growth_rate,
            'activeTechnicians': active_technicians,
            'recommendedTechnicians': recommended_technicians,
            'staffingPressure': staffing_pressure,
            'busiestDay': busiest_day,
            'topRiskService': {
                'serviceType': top_risk_service['serviceType'],
                'predictedNext7Days': top_risk_service['predictedNext7Days'],
                'capacityGap': top_risk_service['capacityGap'],
                'riskLevel': top_risk_service['riskLevel'],
            } if top_risk_service else None,
        }

        return predictive_summary, service_forecasts, daily_forecast
