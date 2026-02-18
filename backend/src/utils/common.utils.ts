import agrologger from "../libs/logger.libs";
import agroservice from "../libs/logger.libs";


const excludeObjectKey = (obj: object, objectKeys: Array<string>) => {
  const newPayload = {} as any;
  for (const [key, value] of Object.entries(obj)) {
    if (objectKeys.includes(key)) {
      continue;
    }
    newPayload[key] = value;
  }
  return newPayload;
};

const checkAndAssign = <T>(
  obj: any,
  keyValue: Array<{ key: string; value: T }>
): void => {
  if (Array.isArray(keyValue) && keyValue.length > 0) {
    for (const item of keyValue) {
      const { key, value } = item;
      if (!Object.keys(obj).includes(key)) {
        obj[key] = value;
      }
    }
  }
  agrologger.info(`Process Check And Assign Completed For the object`);
};

const isMissingAttributeLog = (key: string): `${string} is Missing` => {
  return `${key} is Missing`;
};

const isComparetwoString = (raw: String, db: string) => {
  return String(raw).trim().toLowerCase() === String(db).trim().toLowerCase();
};

const isTrueOrFalse = (key: string): boolean => {
  switch (true) {
    case key === "true": {
      return true;
    }
    case key === "false": {
      return false;
    }
    default: {
      return Boolean(key);
    }
  }
};

export {
  excludeObjectKey,
  checkAndAssign,
  isMissingAttributeLog,
  isComparetwoString,
  isTrueOrFalse
};
