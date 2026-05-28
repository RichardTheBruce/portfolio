// GitHub commits fetcher for the homepage heatmap.
//
// Server-side only. Calls the GitHub GraphQL API with a Personal Access
// Token, returns the daily contribution count for every day of the
// current year. Cached at the fetch layer via Next.js `revalidate` so we
// hit GitHub at most once an hour per deploy.
//
// If the token isn't configured (preview deploys, local dev without
// `.env.local`), this returns null and the heatmap falls back to its
// deterministic seeded distribution. The page never breaks.
//
// To enable: set GITHUB_TOKEN in Vercel project env vars to a Classic
// Personal Access Token with scope `read:user` (and `repo` if you want
// private contributions counted). Then redeploy.

const USERNAME = "RichardTheBruce";
const YEAR = 2026;

const QUERY = `
  query ($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

export interface CommitData {
  total: number;
  // 365-length array of commit counts indexed by day-of-year (Jan 1 = 0).
  dailyCommits: number[];
}

export async function fetchCommits(): Promise<CommitData | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const from = `${YEAR}-01-01T00:00:00Z`;
  const to = `${YEAR}-12-31T23:59:59Z`;

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "RichardTheBruce-Portfolio",
      },
      body: JSON.stringify({
        query: QUERY,
        variables: { username: USERNAME, from, to },
      }),
      // Re-fetch hourly. Set to 0 to bypass caching for testing.
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      console.error("GitHub API error:", res.status, await res.text());
      return null;
    }

    const json = (await res.json()) as {
      data?: {
        user?: {
          contributionsCollection?: {
            contributionCalendar?: {
              totalContributions: number;
              weeks: {
                contributionDays: {
                  date: string;
                  contributionCount: number;
                }[];
              }[];
            };
          };
        };
      };
      errors?: unknown;
    };

    if (json.errors) {
      console.error("GitHub GraphQL errors:", json.errors);
      return null;
    }

    const cal =
      json.data?.user?.contributionsCollection?.contributionCalendar;
    if (!cal) return null;

    // Flatten all weeks into a per-day array indexed by day-of-year.
    const yearStart = new Date(`${YEAR}-01-01T00:00:00Z`);
    const dailyCommits: number[] = new Array(366).fill(0);
    for (const week of cal.weeks) {
      for (const day of week.contributionDays) {
        const d = new Date(`${day.date}T00:00:00Z`);
        if (d.getUTCFullYear() !== YEAR) continue;
        const dayOfYear = Math.floor(
          (d.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (dayOfYear >= 0 && dayOfYear < 366) {
          dailyCommits[dayOfYear] = day.contributionCount;
        }
      }
    }

    return {
      total: cal.totalContributions,
      dailyCommits: dailyCommits.slice(0, 365),
    };
  } catch (err) {
    console.error("GitHub fetch failed:", err);
    return null;
  }
}
