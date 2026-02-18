function mapZodError(errIssue: Array<Record<string, any>>) {
  function ifArrayReturnFirstName(value: string | Array<string>) {
    return Array.isArray(value) ? value[0] : value;
  }
  const errorMapper: Map<string, any> = new Map();
  if (Array.isArray(errIssue) && errIssue.length > 0) {
    for (const issue of errIssue) {
      const isPathAndMessageAvailable = "path" in issue && "message" in issue;
      if (isPathAndMessageAvailable) {
        const pathName = issue["path"];
        const messageName = issue["message"];
        if (!errorMapper.has(pathName)) {
          errorMapper.set(ifArrayReturnFirstName(pathName)!, messageName);
        }
      }
    }
  }
  const mappedEnteries = Object.fromEntries(errorMapper);
  return mappedEnteries;
}

export default mapZodError;
