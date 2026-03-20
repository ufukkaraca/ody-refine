# Overriding the Express API

The Express API consists of various methods and properties on the request and response objects. These are inherited by prototype. There are two extension points:

1. The global prototypes at `express.request` and `express.response`.
2. App-specific prototypes at `app.request` and `app.response`.

Altering the global prototypes will affect all loaded Express apps in the same process. If desired, make alterations app-specific.

## Methods

You can override the signature and behavior of existing methods by assigning a custom function.

```js
app.response.sendStatus = function (statusCode, type, message) {
  return this.contentType(type)
    .status(statusCode)
    .send(message)
}
```

The overridden method may now be used:

```js
res.sendStatus(404, 'application/json', '{"error":"resource not found"}')
```

## Properties

Properties in the Express API are either:

1. Assigned properties (e.g., `req.baseUrl`, `req.originalUrl`)
2. Defined as getters (e.g., `req.secure`, `req.ip`)

Properties under category 1 are dynamically assigned and cannot be overridden.

Properties under category 2 can be overwritten:

```js
Object.defineProperty(app.request, 'ip', {
  configurable: true,
  enumerable: true,
  get () { return this.get('Client-IP') }
})
```

## Prototype

The request/response objects passed to Express need to inherit from the same prototype chain. By default, this is `http.IncomingRequest.prototype` for the request and `http.ServerResponse.prototype` for the response.

Unless necessary, it is recommended that this be done only at the application level.
