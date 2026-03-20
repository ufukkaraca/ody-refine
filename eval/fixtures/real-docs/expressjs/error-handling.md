# Express Error Handling

_Error Handling_ refers to how Express catches and processes errors that occur both synchronously and asynchronously. Express comes with a default error handler so you don't need to write your own to get started.

## Catching Errors

Errors that occur in synchronous code inside route handlers and middleware require no extra work. If synchronous code throws an error, Express will catch and process it:

```js
app.get('/', (req, res) => {
  throw new Error('BROKEN') // Express will catch this on its own.
})
```

For errors from asynchronous functions, you must pass them to `next()`:

```js
app.get('/', (req, res, next) => {
  fs.readFile('/file-does-not-exist', (err, data) => {
    if (err) {
      next(err) // Pass errors to Express.
    } else {
      res.send(data)
    }
  })
})
```

Starting with Express 5, route handlers and middleware that return a Promise will call `next(value)` automatically when they reject or throw an error.

You must catch errors that occur in asynchronous code and pass them to Express for processing.

## The default error handler

Express comes with a built-in error handler. If you pass an error to `next()` and don't handle it in a custom error handler, it will be handled by the built-in handler; the error will be written to the client with the stack trace.

Set the environment variable `NODE_ENV` to `production` to run the app in production mode. The stack trace is not included in the production environment.

## Writing error handlers

Define error-handling middleware functions with four arguments: `(err, req, res, next)`:

```js
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Something broke!')
})
```

You define error-handling middleware last, after other `app.use()` and routes calls.

For organizational purposes, you can define several error-handling middleware functions.
