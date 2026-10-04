// `@react-native/jest-preset` ships its resolver as untyped JavaScript. This
// declares the one shape jest.resolver.mts relies on: a synchronous resolver
// taking the request and jest's resolver options.
declare module "@react-native/jest-preset/jest/resolver.js" {
  interface PresetResolverOptions {
    basedir: string;
    extensions?: string[];
  }

  const resolver: (request: string, options: PresetResolverOptions) => string;

  export default resolver;
}
