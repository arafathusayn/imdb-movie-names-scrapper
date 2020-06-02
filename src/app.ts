import fs from "fs";
import path from "path";
import fetch, { Response } from "node-fetch";
import { JSDOM } from "jsdom";
import { Transform } from "json2csv";

type Movie = {
  title: string;
  year: string;
  genres: string[];
};

type FinalJsonDataType = Movie[];

const movieMatches = (movie: Movie, m: Movie): boolean =>
  movie.title === m.title && movie.year === m.year;

console.log(new Date().toString());

console.log("== Starting the scrapper ==");

const main = async (): Promise<void> => {
  let finalData: FinalJsonDataType = [];

  const response: Response = await fetch("https://www.imdb.com/feature/genre/");

  const body: string = await response.text();

  const matches: RegExpMatchArray | null = body.match(
    /\/search\/title\?genres=\w+&title_type=feature&explore=genres/g,
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

    const genreNullable: string | null = new URL(url).searchParams.get(
      "genres",
    );

    if (!genreNullable) {
      console.error("No genre in the URL!");
      process.exit(1);
    }

    const genres: string[] = [genreNullable];

    response = await fetch(url);

    body = await response.text();

    let titlesCountMatch: RegExpMatchArray | null = body.match(
      /(([0-9]|,)+) titles/,
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
        document.querySelectorAll(".col-title a"),
      ).map((el) => el.textContent);

      const years: (string | null)[] = Array.from(
        document.querySelectorAll(".col-title .lister-item-year"),
      ).map(
        (el) =>
          el.textContent && el.textContent.replace("(", "").replace(")", ""),
      );

      let data: FinalJsonDataType = titles.map((t, i) => ({
        title: t || "",
        year: years[i] || "",
        genres,
      }));

      for (const movie of data) {
        const movieInFinalDataIndex: number = finalData.findIndex((m) =>
          movieMatches(movie, m),
        );

        if (movieInFinalDataIndex === -1) {
          continue;
        }

        const oldGenres = finalData[movieInFinalDataIndex].genres;

        finalData[movieInFinalDataIndex] = {
          ...finalData[movieInFinalDataIndex],
          genres: oldGenres.concat(movie.genres),
        };
      }

      data = data.filter(
        (movie) => !finalData.find((m) => movieMatches(movie, m)),
      );

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

  console.log("Saving Final Data...");

  const filePathPrefix: string = `${path.resolve(
    path.join(__dirname, ".."),
  )}/output/${new Date().getFullYear()}_${
    new Date().getMonth() + 1
  }_${new Date().getDate()}_${Date.now()}`;

  const jsonFilePath: string = `${filePathPrefix}.json`;

  const csvFilePath: string = `${filePathPrefix}.csv`;

  fs.writeFileSync(jsonFilePath, JSON.stringify(finalData), {
    encoding: "utf-8",
  });

  const input: fs.ReadStream = fs.createReadStream(jsonFilePath, {
    encoding: "utf8",
  });

  const output: fs.WriteStream = fs.createWriteStream(csvFilePath, {
    encoding: "utf8",
  });

  const json2csv: Transform<Movie> = new Transform(
    {
      fields: [
        "title",
        "year",
        {
          label: "genres",
          value: (row: Movie) => row.genres.join(","),
        },
      ],
    },
    {
      encoding: "utf-8",
    },
  );

  input.pipe(json2csv).pipe(output);

  const promise: Promise<boolean> = new Promise((resolve, reject) => {
    json2csv
      .on("end", () => {
        console.log("CSV write stream ended.");
        resolve(true);
      })
      .on("error", (err) => {
        console.error(err);
        reject();
      });
  });

  if ((await promise) == true) {
    console.log("CSV file saved successfully.");
  }
};

main().catch((e: Error): void => {
  console.error(e);
  process.exit(1);
});
