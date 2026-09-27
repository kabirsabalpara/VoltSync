if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required. Set it in your .env file.');
}
module.exports = { JWT_SECRET: process.env.JWT_SECRET };
