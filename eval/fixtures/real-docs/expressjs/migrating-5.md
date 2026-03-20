# Moving to Express 5

## Overview

Express 5 is not very different from Express 4; although it maintains the same basic API, there are still changes that break compatibility with the previous version.

To install this version, you need Node.js version 18 or higher:

```sh
npm install "express@5"
```

## Express 5 Codemods

To help migrate your express server, codemods are available:

```sh
npx codemod@latest @expressjs/v5-migration-recipe
```

## Removed methods and properties

- `app.del()` — use `app.delete()` instead
- `app.param(fn)` — deprecated since v4.11.0
- `req.param(name)` — use `req.params`, `req.body`, or `req.query`
- `res.json(obj, status)` — use `res.status(status).json(obj)`
- `res.jsonp(obj, status)` — use `res.status(status).jsonp(obj)`
- `res.redirect('back')` — use `req.get('Referrer') || '/'`
- `res.redirect(url, status)` — use `res.redirect(status, url)`
- `res.send(body, status)` — use `res.status(status).send(body)`
- `res.send(status)` — use `res.sendStatus(statusCode)`
- `res.sendfile()` — use `res.sendFile()` (camelCase)
- `router.param(fn)` — deprecated since v4.11.0
- `express.static.mime` — use the `mime-types` package

## Changed

### Path route matching syntax

The wildcard `*` must have a name: use `/*splat` instead of `/*`.

The optional character `?` is no longer supported, use braces instead.

Regexp characters are not supported in route paths.

### Rejected promises

Request middleware and handlers that return rejected promises are now handled by forwarding the rejected value as an Error to error handling middleware.

### express.urlencoded

The `extended` option defaults to `false` (was `true` in Express 4).

### req.body

Returns `undefined` when the body has not been parsed (was `{}` in Express 4).

### req.host

In Express 4, `req.host` incorrectly stripped the port number. In Express 5, the port number is maintained.

### req.query

The `req.query` property is no longer writable and is instead a getter. The default query parser changed from "extended" to "simple".

### res.status

Only accepts integers in the range 100 to 999.

## Improvements

### Brotli encoding support

Express 5 supports Brotli encoding for requests received from clients that support it.

### res.render()

This method now enforces asynchronous behavior for all view engines.

By end of 2024, the Express team plans to release Express 5.1 with additional TypeScript support improvements.
