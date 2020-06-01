import fetch, { Response } from "node-fetch";
import { JSDOM } from "jsdom";

type FinalJsonDataType = { title: string; year: string }[];

console.log(new Date().toString());

console.log("== Starting the scrapper ==");

const main = async (): Promise<void> => {
  let finalData: FinalJsonDataType = [];

  const response: Response = await fetch("https://www.imdb.com/feature/genre/");

  const body: string = await response.text();

  const matches: RegExpMatchArray | null = body.match(
    /\/search\/title\?genres=\w+&title_type=feature&explore=genres/g
  );

  const urls: string[] | null =
    matches &&
    matches.map((m) => `https://www.imdb.com${m}&sort=alpha,asc&view=simple`);

  console.log("Genres: ", urls);

  if (!urls) {
    console.log("No Genres to start!");
    process.exit(1);
  }

  for (const url of urls) {
    let response: Response;
    let body: string;

    console.log("Scrapping:", url);

    response = await fetch(url);

    body = await response.text();

    let titlesCountMatch: RegExpMatchArray | null = body.match(
      /(([0-9]|,)+) titles/
    );

    const titlesCount =
      (titlesCountMatch && parseInt(titlesCountMatch[1].replace(",", ""))) || 0;

    console.log("Total titles:", titlesCount);

    let nextPageLinkMatch: RegExpMatchArray | null;

    let pageCounter: number = 1;

    while (true) {
      const {
        window: { document },
      } = new JSDOM(body);

      const titles: (string | null)[] = Array.from(
        document.querySelectorAll(".col-title a")
      ).map((el) => el.textContent);

      const years: (string | null)[] = Array.from(
        document.querySelectorAll(".col-title .lister-item-year")
      ).map(
        (el) =>
          el.textContent && el.textContent.replace("(", "").replace(")", "")
      );

      const data: FinalJsonDataType = titles.map((t, i) => ({
        title: t || "",
        year: years[i] || "",
      }));

      finalData = finalData.concat(data);

      console.log("final data length:", finalData.length);

      nextPageLinkMatch = body.match(/a href="((.+)adv_nxt)/);

      if (!nextPageLinkMatch) {
        console.log("> No next page. Finishing this genre...");
        break;
      }

      const nextPageLink: string = `https://www.imdb.com${nextPageLinkMatch[1]}`;

      console.log(`Next page #${++pageCounter}: ${nextPageLink}`);

      response = await fetch(nextPageLink);

      body = await response.text();
    }
  }
};

main().catch((e: Error): void => {
  console.error(e);
  process.exit(1);
});
