<?php

declare(strict_types=1);

namespace App\Api;

use RuntimeException;

final class PhotoroomApiClient
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $baseUrl = 'https://image-api.photoroom.com',
        private readonly int $timeout = 60,
        private readonly int $connectTimeout = 10,
        private readonly string $secondaryApiKey = ''
    ) {
    }

    /**
     * @param array{
     *     format?:'png'|'webp'|'jpg'|'jpeg',
     *     outputSize?:string,
     *     scaling?:'fit'|'fill',
     *     removeBackground?:bool,
     *     backgroundColor?:string
     * } $options
     * @return array{body:string, contentType:string}
     */
    public function editImage(string $imagePath, array $options = []): array
    {
        if (!is_file($imagePath) || !is_readable($imagePath)) {
            throw new RuntimeException('Input image file is not readable.');
        }

        $apiKeys = array_values(array_filter(
            array_unique([$this->apiKey, $this->secondaryApiKey]),
            static fn (string $key): bool => $key !== ''
        ));
        if ($apiKeys === []) {
            throw new RuntimeException('PHOTOROOM_API_KEY is empty.');
        }

        $format = $options['format'] ?? 'png';
        $removeBackground = $options['removeBackground'] ?? true;
        $backgroundColor = $options['backgroundColor'] ?? 'transparent';
        $scaling = $options['scaling'] ?? 'fit';
        $outputSize = $options['outputSize'] ?? null;

        $url = rtrim($this->baseUrl, '/') . '/v2/edit';
        $fields = [
            'imageFile' => curl_file_create($imagePath),
            'removeBackground' => $removeBackground ? 'true' : 'false',
            'background.color' => $backgroundColor,
            'export.format' => $format,
            'scaling' => $scaling,
        ];
        if (is_string($outputSize) && $outputSize !== '') {
            $fields['outputSize'] = $outputSize;
        }

        $lastError = 'Photoroom API request failed.';
        $keysCount = count($apiKeys);
        foreach ($apiKeys as $index => $apiKey) {
            $response = $this->sendRequest($url, $apiKey, $fields);
            if ($response['status'] >= 200 && $response['status'] < 300) {
                $contentType = $response['contentType'];
                if ($contentType === '') {
                    $contentType = $format === 'webp' ? 'image/webp' : ($format === 'png' ? 'image/png' : 'image/jpeg');
                }
                return [
                    'body' => $response['body'],
                    'contentType' => $contentType,
                ];
            }

            $lastError = sprintf('Photoroom API error (%d): %s', $response['status'], $response['details']);
            $canRetryWithSecondary = $response['status'] === 402 && $index < ($keysCount - 1);
            if (!$canRetryWithSecondary) {
                break;
            }
        }

        throw new RuntimeException($lastError);
    }

    /**
     * @param array<string,mixed> $fields
     * @return array{status:int,body:string,contentType:string,details:string}
     */
    private function sendRequest(string $url, string $apiKey, array $fields): array
    {
        $ch = curl_init($url);
        if ($ch === false) {
            throw new RuntimeException('Unable to initialize curl.');
        }

        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_HTTPHEADER => [
                'x-api-key: ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => $fields,
            CURLOPT_TIMEOUT => $this->timeout,
            CURLOPT_CONNECTTIMEOUT => $this->connectTimeout,
        ]);

        $rawResponse = curl_exec($ch);
        if ($rawResponse === false) {
            $error = curl_error($ch);
            throw new RuntimeException('Photoroom request failed: ' . $error);
        }

        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $body = substr($rawResponse, $headerSize);
        $decoded = json_decode($body, true);
        $details = is_array($decoded) ? (string) json_encode($decoded, JSON_UNESCAPED_UNICODE) : trim($body);

        return [
            'status' => $status,
            'body' => $body,
            'contentType' => $contentType,
            'details' => $details,
        ];
    }
}
