import 'server-only';
import { kvGet } from '../store';

/** The handle a wallet has claimed, if any. */
export const handleOf = (address: string) => kvGet<string>(`corridor:addr:${address}`);
