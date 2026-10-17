/** Error with an HTTP status. Throw it anywhere; the error middleware turns it into a JSON response. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  static badRequest(msg = "Bad request", details?: unknown) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = "Please sign in") {
    return new ApiError(401, msg);
  }
  static forbidden(msg = "You do not have access to this") {
    return new ApiError(403, msg);
  }
  static notFound(msg = "Not found") {
    return new ApiError(404, msg);
  }
  static conflict(msg = "Already exists") {
    return new ApiError(409, msg);
  }
}
