import { customType, index, integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { articles } from "./articles";
import { id, timestamps } from "./_shared";

const vector = (name: string, dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(v: number[]) {
      return `[${v.join(",")}]`;
    },
    fromDriver(v: string) {
      return JSON.parse(v) as number[];
    },
  })(name);

export const articleEmbeddings = pgTable(
  "article_embeddings",
  {
    id: id(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull().default(0),
    model: varchar("model", { length: 64 }).notNull(),
    embedding: vector("embedding", 1536).notNull(),
    ...timestamps,
  },
  (t) => [index("embeddings_article_idx").on(t.articleId, t.chunkIndex)],
);

export type ArticleEmbedding = typeof articleEmbeddings.$inferSelect;
export type NewArticleEmbedding = typeof articleEmbeddings.$inferInsert;
