---
title: JWT - JSON Web Tokens
headline:
---

* https://auth0.com/blog/a-look-at-the-latest-draft-for-jwt-bcp/
* https://evalcode.com/jwt-attacks-and-prevention/

Tokens are base64 encoded which means the information stored in them can be read by anyone. Don’t send sensitive information in them:

* https://jwt.io/

For instance the following JWT:

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.PcmVIPbcZl9j7qFzXRAeSyhtuBnHQNMuLHsaG5l804A
```

Decodes into this:

```
{"alg":"HS256","typ":"JWT"}{"sub":"1234567890","name":"John Doe","iat":1516239022}Rme>5t
28
```

JWT’s are sent with a signature that needs to be verified in order for you to trust anything that is sent.
