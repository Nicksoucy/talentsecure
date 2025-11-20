declare module "xss" {
  type XSSFilter = (input: string) => string;
  const xss: XSSFilter;
  export default xss;
}
