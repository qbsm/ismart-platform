<?php

namespace App\Service;

final class LanguageService
{
    /**
     * Определяет язык из первого сегмента URL.
     *
     * Если первый сегмент совпадает с кодом поддерживаемого языка,
     * он извлекается из сегментов и устанавливается как текущий язык.
     *
     * @param string[]                             $segments           Сегменты URL
     * @param array<string, array<string, mixed>>  $supportedLanguages Языки: code => {code, title, direction}
     * @param string                               $defaultCode        Код языка по умолчанию
     * @return array{lang_code:string,current_lang:array<string,mixed>,is_lang_in_url:bool,segments:array<int,string>}
     */
    public function detect(array $segments, array $supportedLanguages, string $defaultCode): array
    {
        $langCode = $defaultCode;
        $currentLang = $supportedLanguages[$defaultCode] ?? ['code' => $defaultCode];
        $isInUrl = false;
        $resultSegments = array_values($segments);

        if (!empty($resultSegments) && isset($supportedLanguages[$resultSegments[0]])) {
            $langCode = (string) $resultSegments[0];
            $currentLang = $supportedLanguages[$langCode];
            $isInUrl = true;
            array_shift($resultSegments);
        }

        return [
            'lang_code' => $langCode,
            'current_lang' => $currentLang,
            'is_lang_in_url' => $isInUrl,
            'segments' => $resultSegments,
        ];
    }
}
