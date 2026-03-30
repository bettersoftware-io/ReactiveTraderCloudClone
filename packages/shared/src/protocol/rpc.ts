export type RpcResponse<T = void> =
  | { readonly type: "ack"; readonly payload?: T }
  | { readonly type: "nack" };
