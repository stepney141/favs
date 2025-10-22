export const getRedirectedUrl = async (targetUrl: string): Promise<string | undefined> => {
  try {
    const response = await fetch(targetUrl, { redirect: "follow" });
    return response.url;
  } catch (error) {
    console.error("Failed to follow redirect", error);
    return undefined;
  }
};
