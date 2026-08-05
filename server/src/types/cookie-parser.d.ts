import type { RequestHandler } from 'express';

declare function cookieParser(): RequestHandler;
export default cookieParser;
