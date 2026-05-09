<?php

namespace App\Services;

use App\Models\Tenant;

class TenantUploadSettingsService
{
    private const DEFAULT_DISK = 'public';
    private const DEFAULT_BASE_PATH = 'exam-questions';

    public function getForTenant(Tenant $tenant): array
    {
        $settings = is_array($tenant->settings) ? $tenant->settings : [];
        $uploads = is_array($settings['uploads'] ?? null) ? $settings['uploads'] : [];

        $disk = (string) ($uploads['disk'] ?? self::DEFAULT_DISK);
        $basePath = $this->normalizeBasePath((string) ($uploads['base_path'] ?? self::DEFAULT_BASE_PATH));

        return [
            'disk' => $disk,
            'base_path' => $basePath,
        ];
    }

    public function buildExamQuestionDirectory(Tenant $tenant, int $examId, string|int $questionSegment): array
    {
        $config = $this->getForTenant($tenant);

        return [
            'disk' => $config['disk'],
            'directory' => $this->normalizePath(
                $config['base_path'] . '/' . $tenant->id . '/' . $examId . '/' . $questionSegment
            ),
        ];
    }

    public function buildStudentPhotoDirectory(Tenant $tenant, int $studentId): array
    {
        $config = $this->getForTenant($tenant);

        return [
            'disk' => $config['disk'],
            'directory' => $this->normalizePath(
                $config['base_path'] . '/' . $tenant->id . '/students/' . $studentId
            ),
        ];
    }

    public function buildTenantPhotoDirectory(Tenant $tenant): array
    {
        $config = $this->getForTenant($tenant);

        return [
            'disk' => $config['disk'],
            'directory' => $this->normalizePath(
                $config['base_path'] . '/' . $tenant->id . '/tenant'
            ),
        ];
    }

    public function url(string $disk, string $path): string
    {
        $normalizedPath = ltrim($path, '/');

        if ($disk === 'public') {
            return asset('storage/' . $normalizedPath);
        }

        $diskUrl = (string) config("filesystems.disks.{$disk}.url", '');

        if ($diskUrl !== '') {
            return rtrim($diskUrl, '/') . '/' . $normalizedPath;
        }

        return asset('storage/' . $normalizedPath);
    }

    public function normalizeBasePath(string $basePath): string
    {
        $normalized = $this->normalizePath($basePath);

        return $normalized === '' ? self::DEFAULT_BASE_PATH : $normalized;
    }

    private function normalizePath(string $path): string
    {
        $normalized = trim($path);
        $normalized = preg_replace('#/+#', '/', $normalized) ?? '';
        $normalized = trim($normalized, '/');

        return $normalized;
    }
}