<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantSetting;

class TenantNotificationSettingsService
{
    public const MODULE = 'notifications';

    public const KEY_CALENDAR_ENABLED_TYPES = 'calendar_enabled_types';

    /**
     * @return list<string>
     */
    public function allNotificationTypeKeys(): array
    {
        return array_keys(config('student_notifications.types', []));
    }

    /**
     * @return list<string>
     */
    public function defaultCalendarEnabledTypes(): array
    {
        $defaults = config('student_notifications.calendar_defaults.enabled_types');

        if (! is_array($defaults) || $defaults === []) {
            return $this->allNotificationTypeKeys();
        }

        return $this->normalizeCalendarEnabledTypes($defaults);
    }

    /**
     * @return list<string>
     */
    public function calendarEnabledTypes(Tenant $tenant): array
    {
        $row = TenantSetting::query()
            ->where('tenant_id', $tenant->id)
            ->where('module', self::MODULE)
            ->where('key', self::KEY_CALENDAR_ENABLED_TYPES)
            ->first();

        if (! $row) {
            return $this->defaultCalendarEnabledTypes();
        }

        $value = $row->getTypedValue();

        return $this->normalizeCalendarEnabledTypes(is_array($value) ? $value : []);
    }

    /**
     * @param  list<string>  $types
     * @return list<string>
     */
    public function updateCalendarEnabledTypes(Tenant $tenant, array $types): array
    {
        $normalized = $this->normalizeCalendarEnabledTypes($types);

        TenantSetting::updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'module'    => self::MODULE,
                'key'       => self::KEY_CALENDAR_ENABLED_TYPES,
            ],
            [
                'value'       => TenantSetting::wrapValue($normalized),
                'description' => 'Tipos de notificação que podem ser publicados no calendário ao enviar.',
            ]
        );

        return $normalized;
    }

    public function isCalendarEnabledForType(Tenant $tenant, string $type): bool
    {
        return in_array($type, $this->calendarEnabledTypes($tenant), true);
    }

    /**
     * @return array<string, string>
     */
    public function calendarTypeLabels(): array
    {
        $map = config('student_notifications.calendar_type_map', []);
        $labels = [];

        foreach ($map as $notificationType => $calendarType) {
            $meta = config('calendar_events.types.'.$calendarType, []);
            $labels[$notificationType] = (string) ($meta['label'] ?? $calendarType);
        }

        return $labels;
    }

    /**
     * @param  list<string>|array<int, string>  $types
     * @return list<string>
     */
    private function normalizeCalendarEnabledTypes(array $types): array
    {
        $allowed = $this->allNotificationTypeKeys();

        $normalized = [];
        foreach ($types as $type) {
            $type = (string) $type;
            if ($type !== '' && in_array($type, $allowed, true)) {
                $normalized[] = $type;
            }
        }

        return array_values(array_unique($normalized));
    }
}
