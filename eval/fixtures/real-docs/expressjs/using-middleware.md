# Using Express Middleware

Express is a routing and middleware web framework with minimal functionality of its own: An Express application is essentially a series of middleware function calls.

_Middleware_ functions have access to the request object (`req`), the response object (`res`), and the `next` middleware function. Middleware functions can:

* Execute any code.
* Make changes to the request and response objects.
* End the request-response cycle.
* Call the next middleware function in the stack.

If the current middleware function does not end the request-response cycle, it must call `next()`. Otherwise, the request will be left hanging.

An Express application can use the following types of middleware:

- Application-level middleware
- Router-level middleware
- Error-handling middleware
- Built-in middleware
- Third-party middleware

## Application-level middleware

Bind application-level middleware to an instance of the app object using `app.use()` and `app.METHOD()`.

```js
const express = require('express')
const app = express()

app.use((req, res, next) => {
  console.log('Time:', Date.now())
  next()
})
```

## Router-level middleware

Router-level middleware works the same as application-level middleware, except it is bound to `express.Router()`.

## Error-handling middleware

Error-handling middleware always takes four arguments `(err, req, res, next)`. You must provide four arguments to identify it as error-handling middleware.

```js
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})
```

## Built-in middleware

Starting with version 4.x, Express no longer depends on Connect.

Express has the following built-in middleware functions:

- `express.static` serves static assets such as HTML files, images, and so on.
- `express.json` parses incoming requests with JSON payloads. NOTE: Available with Express 4.16.0+
- `express.urlencoded` parses incoming requests with URL-encoded payloads. NOTE: Available with Express 4.16.0+

## Third-party middleware

Use third-party middleware to add functionality to Express apps. Install the Node.js module for the required functionality, then load it in your app.
