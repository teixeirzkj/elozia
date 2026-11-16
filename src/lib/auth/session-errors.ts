export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para realizar esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
