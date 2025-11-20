# Инструкция по обновлению сервера для поддержки HMAC подписи мобильных запросов

## Обзор изменений

Вместо проверки заголовка `X-Mobile-Secret` теперь используется HMAC-SHA256 подпись запросов.

## Что изменить

### 1. Удалить проверку `X-Mobile-Secret`

Удалите проверку заголовка `X-Mobile-Secret` из middleware или обработчиков.

### 2. Добавить проверку новых заголовков

Теперь нужно проверять два заголовка:
- `X-Mobile-Signature` - HMAC-SHA256 подпись запроса (Base64)
- `X-Mobile-Timestamp` - timestamp запроса в миллисекундах (Unix timestamp * 1000)

### 3. Обновить middleware

Замените проверку секрета на проверку подписи:

```go
func (m *MobileSignatureMiddleware) verifyMobileSignature(r *http.Request) bool {
    signature := r.Header.Get("X-Mobile-Signature")
    timestampStr := r.Header.Get("X-Mobile-Timestamp")
    
    if signature == "" || timestampStr == "" {
        return false
    }
    
    // Если секрет не установлен в конфиге - пропускаем проверку (для разработки)
    if m.mobileAppSecret == "" {
        return true
    }
    
    // Проверка timestamp (защита от replay атак)
    timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
    if err != nil {
        return false
    }
    
    now := time.Now().UnixMilli()
    diff := now - timestamp
    if diff < 0 {
        diff = -diff
    }
    if diff > 300000 { // 5 минут (300000 мс)
        return false
    }
    
    // Формирование строки для подписи: только TIMESTAMP
    signString := strconv.FormatInt(timestamp, 10)
    
    // Генерация ожидаемой подписи
    mac := hmac.New(sha256.New, []byte(m.mobileAppSecret))
    mac.Write([]byte(signString))
    expectedSignature := base64.StdEncoding.EncodeToString(mac.Sum(nil))
    
    // Constant-time сравнение
    return hmac.Equal([]byte(signature), []byte(expectedSignature))
}
```

### 4. Обновить ServeHTTP метод

Убедитесь, что OPTIONS запросы пропускаются без проверки:

```go
func (m *MobileSignatureMiddleware) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // 1. Пропускаем OPTIONS (CORS preflight)
    if r.Method == "OPTIONS" {
        m.h.ServeHTTP(w, r)
        return
    }
    
    // 2. Проверяем подпись для всех остальных запросов
    if !m.verifyMobileSignature(r) {
        http.Error(w, "Unauthorized: Invalid mobile signature", http.StatusUnauthorized)
        return
    }
    
    m.h.ServeHTTP(w, r)
}
```

## Формат строки для подписи

**Упрощенный формат: подписываем только TIMESTAMP**

Строка для подписи: просто `TIMESTAMP` (как строка)

Где:
- `TIMESTAMP` - Unix timestamp в миллисекундах (например, `1723668692000`)

### Примеры строк для подписи:

**Любой запрос:**
```
1723668692000
```

Подпись генерируется только из timestamp, без учета метода, пути или body.

## Важные моменты

1. **Подписываем только timestamp** - метод, путь и body НЕ используются
2. **Timestamp в миллисекундах** - используйте `time.Now().UnixMilli()`, не `Unix()`
3. **Timestamp как строка** - преобразуйте timestamp в строку перед подписью: `strconv.FormatInt(timestamp, 10)`
4. **Constant-time сравнение** - используйте `hmac.Equal()` для сравнения подписей
5. **OPTIONS пропускаются** - CORS preflight запросы не требуют подписи

## Секретный ключ

Секретный ключ остается тем же: `12544667677898898992222`

Он используется для генерации HMAC-SHA256 подписи, но **не передается** в заголовках запроса.

## Тестирование

Для тестирования можно временно отключить проверку, установив пустой секрет:

```go
// Для разработки - пропускать проверку если секрет не установлен
if m.mobileAppSecret == "" {
    return true
}
```

## Пример полного middleware

```go
package middleware

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/base64"
    "net/http"
    "strconv"
    "time"
)

type MobileSignatureMiddleware struct {
    h               http.Handler
    mobileAppSecret string
}

func NewMobileSignatureMiddleware(h http.Handler, mobileAppSecret string) *MobileSignatureMiddleware {
    return &MobileSignatureMiddleware{
        h:               h,
        mobileAppSecret: mobileAppSecret,
    }
}

func (m *MobileSignatureMiddleware) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    // Пропускаем OPTIONS (CORS preflight)
    if r.Method == "OPTIONS" {
        m.h.ServeHTTP(w, r)
        return
    }
    
    // Проверяем подпись для всех остальных запросов
    if !m.verifyMobileSignature(r) {
        http.Error(w, "Unauthorized: Invalid mobile signature", http.StatusUnauthorized)
        return
    }
    
    m.h.ServeHTTP(w, r)
}

func (m *MobileSignatureMiddleware) verifyMobileSignature(r *http.Request) bool {
    signature := r.Header.Get("X-Mobile-Signature")
    timestampStr := r.Header.Get("X-Mobile-Timestamp")
    
    if signature == "" || timestampStr == "" {
        return false
    }
    
    // Если секрет не установлен в конфиге - пропускаем проверку (для разработки)
    if m.mobileAppSecret == "" {
        return true
    }
    
    // Проверка timestamp (защита от replay атак)
    timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
    if err != nil {
        return false
    }
    
    now := time.Now().UnixMilli()
    diff := now - timestamp
    if diff < 0 {
        diff = -diff
    }
    if diff > 300000 { // 5 минут (300000 мс)
        return false
    }
    
    // Формирование строки для подписи: только TIMESTAMP (как строка)
    signString := strconv.FormatInt(timestamp, 10)
    
    // Генерация ожидаемой подписи
    mac := hmac.New(sha256.New, []byte(m.mobileAppSecret))
    mac.Write([]byte(signString))
    expectedSignature := base64.StdEncoding.EncodeToString(mac.Sum(nil))
    
    // Constant-time сравнение
    return hmac.Equal([]byte(signature), []byte(expectedSignature))
}
```

## Чеклист изменений

- [ ] Удалить проверку заголовка `X-Mobile-Secret`
- [ ] Добавить проверку заголовков `X-Mobile-Signature` и `X-Mobile-Timestamp`
- [ ] Обновить формат строки для подписи: только `TIMESTAMP` (как строка)
- [ ] Добавить проверку timestamp (защита от replay атак, окно ±5 минут)
- [ ] Убедиться, что OPTIONS запросы пропускаются
- [ ] Использовать `hmac.Equal()` для сравнения подписей
- [ ] Использовать `strconv.FormatInt(timestamp, 10)` для преобразования timestamp в строку
- [ ] Протестировать с реальными запросами от мобильного приложения

