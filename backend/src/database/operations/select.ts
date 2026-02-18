class SearchOpertaion {
  public async search<T>(key: string, value: T, model: any) {
    const result = await model.findOne({
      [`${key}`]: value,
    });
    return result;
  }

  public async searchAll(model: any) {
    return model.find({});
  }

  public async searchPopulate<T>(
    key: string,
    value: T,
    model: any,
    modelPopulate: string
  ) {
    const result = await model
      .findOne({
        [`${key}`]: value,
      })
      .populate(modelPopulate);
    return result;
  }
    public async searchPopulateThree<T>(
    key: string,
    value: T,
    model: any,
    modelPopulate1: string,
    modelPopulate2: string,
    modelPopulate3: string
  ) {
    const result = await model
      .findOne({
        [`${key}`]: value,
      })
      .populate(modelPopulate1)
      .populate(modelPopulate2)
      .populate(modelPopulate3,"userPreference");
    return result;
  }

  public async searchAnd(payload: Record<string, string>, model: any) {
    return model.find(payload);
  }
}

const searchInstance = () => {
  return new SearchOpertaion();
};
export default searchInstance;
