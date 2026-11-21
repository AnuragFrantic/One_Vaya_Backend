import { Schema, model } from "mongoose";

/* Website content editable without a developer: blog, FAQ, legal pages, chatbot knowledge. */

const blogSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    excerpt: String,
    category: String,
    image: String,
    date: { type: Date, default: Date.now }, // publish date (defaults to today)
    readMin: Number,
    author: String,
    // Blocks: { type: "p" | "h2" | "ul" | "quote", text?, items? }
    body: { type: [Schema.Types.Mixed], default: [] },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const BlogPost = model("BlogPost", blogSchema);

const faqSchema = new Schema(
  {
    q: { type: String, required: true },
    a: { type: String, required: true },
    category: { type: String, default: "General" },
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Faq = model("Faq", faqSchema);

const legalSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    intro: String,
    sections: [{ _id: false, heading: String, body: [String] }],
  },
  { timestamps: true },
);
export const LegalPage = model("LegalPage", legalSchema);

/**
 * Approved information the AI chatbot is allowed to use (proposal: "Manage the
 * information the AI chatbot is allowed to use"). Only active entries are sent to the AI.
 */
const knowledgeSchema = new Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, default: "General" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const ChatbotKnowledge = model("ChatbotKnowledge", knowledgeSchema);

/** Homepage slider: the big picture, headline and buttons at the top of the website. Managed in the admin panel. */
const heroSlideSchema = new Schema(
  {
    eyebrow: { type: String, default: "" }, // small line above the headline
    title: { type: String, required: true }, // headline
    titleAccent: { type: String, default: "" }, // optional second headline line, shown in italics
    text: { type: String, default: "" }, // short paragraph
    image: { type: String, required: true },
    imageAlt: { type: String, default: "" }, // describes the picture for screen readers; the headline is used if empty
    primaryLabel: { type: String, default: "" },
    primaryLink: { type: String, default: "" },
    secondaryLabel: { type: String, default: "" },
    secondaryLink: { type: String, default: "" },
    isPublished: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const HeroSlide = model("HeroSlide", heroSlideSchema);

const subscriberSchema = new Schema(
  { email: { type: String, required: true, unique: true, lowercase: true, trim: true } },
  { timestamps: true },
);
export const Subscriber = model("Subscriber", subscriberSchema);
