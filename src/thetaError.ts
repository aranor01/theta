export class ThetaError extends Error {
    constructor(message:string, cause:unknown = undefined) {
        super(message, { cause: cause})
    }
}