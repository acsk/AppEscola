<?php

namespace App\Services;

use RuntimeException;
use ZipArchive;

/**
 * Agrupa PDFs em um único arquivo.
 * - PDF concatenado: apenas se setasign/fpdi estiver no vendor (upload manual).
 * - ZIP: padrão em hospedagem compartilhada (sem composer no deploy).
 */
class PdfMergeService
{
    public function supportsPdfMerge(): bool
    {
        return class_exists(\setasign\Fpdi\Fpdi::class);
    }

    public function defaultArchiveFormat(): string
    {
        return $this->supportsPdfMerge() ? 'pdf' : 'zip';
    }

    /**
     * @param  array<int, array{name: string, content: string}>  $files
     * @return array{format: 'pdf'|'zip', content: string}
     */
    public function bundle(array $files): array
    {
        if ($files === []) {
            throw new RuntimeException('Nenhum boleto para montar o carnê.');
        }

        if ($this->supportsPdfMerge()) {
            $contents = array_map(static fn (array $file) => $file['content'], $files);

            return [
                'format' => 'pdf',
                'content' => $this->merge($contents),
            ];
        }

        return [
            'format' => 'zip',
            'content' => $this->buildZip($files),
        ];
    }

    /**
     * @param  array<int, string>  $pdfContents
     */
    public function merge(array $pdfContents): string
    {
        if ($pdfContents === []) {
            throw new RuntimeException('Nenhum PDF para mesclar.');
        }

        if (! $this->supportsPdfMerge()) {
            throw new RuntimeException(
                'Mesclagem em PDF único indisponível neste servidor. O carnê será entregue em ZIP.'
            );
        }

        $pdf = new \setasign\Fpdi\Fpdi();

        foreach ($pdfContents as $index => $content) {
            if ($content === '') {
                throw new RuntimeException('PDF vazio na posição ' . ($index + 1) . '.');
            }

            $stream = fopen('php://temp', 'r+');
            if ($stream === false) {
                throw new RuntimeException('Não foi possível preparar o PDF para mesclagem.');
            }

            try {
                fwrite($stream, $content);
                rewind($stream);

                $pageCount = $pdf->setSourceFile($stream);

                if ($pageCount < 1) {
                    throw new RuntimeException('PDF sem páginas na posição ' . ($index + 1) . '.');
                }

                for ($page = 1; $page <= $pageCount; $page++) {
                    $template = $pdf->importPage($page);
                    $size = $pdf->getTemplateSize($template);
                    $orientation = ($size['width'] ?? 0) > ($size['height'] ?? 0) ? 'L' : 'P';
                    $pdf->AddPage($orientation, [$size['width'], $size['height']]);
                    $pdf->useTemplate($template);
                }
            } catch (\Throwable $e) {
                throw new RuntimeException(
                    'Arquivo na posição ' . ($index + 1) . ' não é um PDF válido: ' . $e->getMessage(),
                    0,
                    $e
                );
            } finally {
                fclose($stream);
            }
        }

        $output = $pdf->Output('S');

        if ($output === '' || strlen($output) < 200) {
            throw new RuntimeException('O PDF do carnê ficou vazio após a mesclagem.');
        }

        return $output;
    }

    /**
     * @param  array<int, array{name: string, content: string}>  $files
     */
    private function buildZip(array $files): string
    {
        if (! class_exists(ZipArchive::class)) {
            throw new RuntimeException(
                'Extensão ZIP do PHP não está habilitada no servidor. Contate a hospedagem.'
            );
        }

        $tmpPath = tempnam(sys_get_temp_dir(), 'carne_');
        if ($tmpPath === false) {
            throw new RuntimeException('Não foi possível criar arquivo temporário para o carnê.');
        }

        $zip = new ZipArchive();
        $opened = $zip->open($tmpPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        if ($opened !== true) {
            @unlink($tmpPath);
            throw new RuntimeException('Não foi possível criar o arquivo ZIP do carnê.');
        }

        foreach ($files as $index => $file) {
            $name = $file['name'] !== '' ? $file['name'] : sprintf('boleto-%02d.pdf', $index + 1);
            if (! $zip->addFromString($name, $file['content'])) {
                $zip->close();
                @unlink($tmpPath);
                throw new RuntimeException("Não foi possível adicionar o boleto \"{$name}\" ao ZIP.");
            }
        }

        $zip->close();

        $binary = file_get_contents($tmpPath);
        @unlink($tmpPath);

        if ($binary === false || $binary === '') {
            throw new RuntimeException('Falha ao ler o ZIP do carnê.');
        }

        return $binary;
    }
}
