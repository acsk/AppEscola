<?php
header('Content-Type: application/json');

$apiUrl = 'https://api.appcurso.com.br/api/login';

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_URL => $apiUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
        'login' => 'test@test.com',
        'password' => 'password'
    ]),
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Accept: application/json',
        'Origin: https://appcurso.com.br'
    ]
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    die(json_encode([
        'error' => 'curl_error',
        'message' => curl_error($ch)
    ]));
}

// Separar headers da resposta
list($headers, $body) = explode("\r\n\r\n", $response, 2);

$headerLines = explode("\r\n", $headers);
$corsHeaders = [];

foreach ($headerLines as $line) {
    if (stripos($line, 'access-control') === 0 || 
        stripos($line, 'content-type') === 0 ||
        stripos($line, 'x-') === 0) {
        $corsHeaders[] = $line;
    }
}

echo json_encode([
    'http_code' => $httpCode,
    'cors_headers' => $corsHeaders,
    'all_headers' => $headerLines,
    'response_body' => json_decode($body, true)
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
?>
