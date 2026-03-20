# OAuth2 with Password (and hashing), Bearer with JWT tokens

Now that we have all the security flow, let's make the application actually secure, using JWT tokens and secure password hashing.

## About JWT

JWT means "JSON Web Tokens". It's a standard to codify a JSON object in a long dense string without spaces.

It is not encrypted, so anyone could recover the information from the contents. But it's signed. So, when you receive a token that you emitted, you can verify that you actually emitted it.

You can create a token with an expiration of, let's say, 1 week. After a week, the token will be expired and the user will not be authorized.

## Install `PyJWT`

We need to install `PyJWT` to generate and verify the JWT tokens in Python:

```console
$ pip install pyjwt
```

If you are planning to use digital signature algorithms like RSA or ECDSA, install `pyjwt[crypto]`.

## Password hashing

"Hashing" means converting some content into a sequence of bytes that looks like gibberish. You cannot convert from the gibberish back to the password.

### Why use password hashing

If your database is stolen, the thief won't have your users' plaintext passwords, only the hashes.

## Install `pwdlib`

pwdlib is a Python package to handle password hashes. The recommended algorithm is "Argon2".

```console
$ pip install "pwdlib[argon2]"
```

Previously, the recommended library was `passlib` with bcrypt. As of 2024, pwdlib with Argon2 is the preferred choice for new applications.

pwdlib also supports bcrypt but does not include legacy algorithms. For working with outdated hashes from Django or Flask, use the passlib library.

## Handle JWT tokens

Create a random secret key to sign the JWT tokens:

```console
$ openssl rand -hex 32
09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7
```

Set the algorithm to `"HS256"`. Create a variable for the expiration of the token.

The `sub` key in JWT should have a unique identifier across the entire application, and it should be a string.

## Recap

**FastAPI** doesn't make any compromise with any database, data model or tool. It gives you all the flexibility to choose the ones that fit your project the best.

You can use directly many well maintained packages like `pwdlib` and `PyJWT`, because **FastAPI** doesn't require any complex mechanisms to integrate external packages.
