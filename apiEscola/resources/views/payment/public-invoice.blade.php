<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Pagamento{{ $schoolName ? ' · '.$schoolName : '' }}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f5f7; color: #1f2430; }
        .wrap { max-width: 480px; margin: 0 auto; padding: 24px 16px 40px; }
        .school { font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 8px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .muted { color: #6b7280; font-size: 13px; }
        .summary { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-top: 12px; }
        .amount { font-size: 24px; font-weight: 700; color: #1d4ed8; }
        .label { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 8px; }
        .code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; background: #f4f5f7; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; word-break: break-all; }
        .btn { display: block; width: 100%; margin-top: 10px; padding: 12px; border-radius: 8px; border: 1px solid #1d4ed8; background: #1d4ed8; color: #fff; font-size: 15px; font-weight: 600; text-align: center; text-decoration: none; cursor: pointer; }
        .btn.outline { background: #fff; color: #1d4ed8; }
        .qr { display: block; width: 200px; max-width: 100%; margin: 0 auto 8px; }
        .status { border-radius: 12px; padding: 16px; text-align: center; font-weight: 600; }
        .status.paid { background: #e8f7ee; color: #15803d; border: 1px solid #86efac; }
        .status.off { background: #f4f5f7; color: #4b5563; border: 1px solid #e5e7eb; }
    </style>
</head>
<body>
<main class="wrap">
    @if ($schoolName)
        <div class="school">{{ $schoolName }}</div>
    @endif

    <section class="card">
        <h1>{{ $studentFirstName ? 'Olá, '.$studentFirstName.'!' : 'Pagamento' }}</h1>
        <div class="muted">{{ $description }}</div>
        <div class="summary">
            <div>
                <div class="label" style="margin-bottom:2px">Vencimento</div>
                <strong>{{ $dueDate ?? '—' }}</strong>
            </div>
            <div class="amount">{{ $amount }}</div>
        </div>
    </section>

    @if ($isPaid)
        <div class="status paid">Pagamento confirmado. Obrigado!</div>
    @elseif ($isCancelled)
        <div class="status off">Esta cobrança foi cancelada. Fale com a secretaria da escola.</div>
    @elseif (! $pixCopyPaste && ! $boletoDigitable && ! $boletoUrl)
        <div class="status off">A cobrança ainda não está disponível. Fale com a secretaria da escola.</div>
    @else
        @if ($pixCopyPaste)
            <section class="card">
                <div class="label">PIX copia e cola</div>
                @if ($pixQrImageUrl)
                    <img class="qr" src="{{ $pixQrImageUrl }}" alt="QR Code PIX">
                @endif
                <div class="code" id="pix">{{ $pixCopyPaste }}</div>
                <button type="button" class="btn" data-copy="pix">Copiar código PIX</button>
            </section>
        @endif

        @if ($boletoDigitable || $boletoUrl)
            <section class="card">
                <div class="label">Boleto</div>
                @if ($boletoDigitable)
                    <div class="code" id="boleto">{{ $boletoDigitable }}</div>
                    <button type="button" class="btn" data-copy="boleto">Copiar linha digitável</button>
                @endif
                @if ($boletoUrl)
                    <a class="btn outline" href="{{ $boletoUrl }}" target="_blank" rel="noopener noreferrer">Abrir boleto (PDF)</a>
                @endif
            </section>
        @endif
    @endif
</main>
<script>
    document.querySelectorAll('[data-copy]').forEach(function (button) {
        button.addEventListener('click', function () {
            var text = document.getElementById(button.dataset.copy).textContent.trim();
            var label = button.textContent;
            var done = function () {
                button.textContent = 'Copiado!';
                setTimeout(function () { button.textContent = label; }, 2000);
            };
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(done);
                return;
            }
            var area = document.createElement('textarea');
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
            done();
        });
    });
</script>
</body>
</html>
