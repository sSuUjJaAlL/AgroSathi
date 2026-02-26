function modelResponseMapper(response: string) {
  const cleaned = response.replace(/```/g, "").trim();

  const getValue = (label: string): string | null => {
    const match = cleaned.match(new RegExp(`${label}:\\s*(.*)`));
    return match && match[1] ? match[1].trim() : null;
  };

  const getList = (section: string): string[] => {
    const regex = new RegExp(`${section}:([\\s\\S]*?)(\\n\\w+:|$)`);
    const match = cleaned.match(regex);

    if (!match || !match[1]) return [];

    return match[1]
      .split("\n")
      .map(line => line.replace("-", "").trim())
      .filter(line => line.length > 0);
  };

  return {
    fruit: getValue("Fruit"),
    disease: getValue("Disease"),
    severity: getValue("Severity"),
    preventiveMeasures: getList("Preventive Measures"),
    treatment: getList("Treatment"),
    fertilizer: {
      npk: getValue("NPK ratio"),
      application: getValue("Application")
    }
  };
}

export default modelResponseMapper;