

Invoke-WebRequest -Uri "http://localhost:3001/api/chat" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body "{`"message`":`"can I speak to someone`",`"sessionId`":`"b4c08c4a-2a70-418e-a073-9b3ff1af1819`"}" | ConvertFrom-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/chat" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"message":"Hi, what products do you offer?"}' | ConvertFrom-Json
