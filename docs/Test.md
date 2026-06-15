

Invoke-WebRequest -Uri "http://localhost:3001/api/chat" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body "{`"message`":`"can I speak to someone`",`"sessionId`":`"42e1746b-7c6a-4a87-8651-e17ae65ffead`"}" | ConvertFrom-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/chat" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"message":"Hi, what products do you offer?"}' | ConvertFrom-Json


$response = Invoke-RestMethod -Uri "http://localhost:3001/api/chat" `
  -Method POST `
  -Headers @{ "Content-Type" = "application/json" } `
  -Body '{"message":"Tell me more about cic insurance my name is steve ","sessionId":"1315bcef-7d93-4034-9707-efad84e9b89c"}'

$response | ConvertTo-Json -Depth 10 | Out-String -Width 4096