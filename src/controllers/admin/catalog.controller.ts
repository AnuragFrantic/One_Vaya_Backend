import { Service, Experience, HolidayPackage, Hotel, BlogPost, Faq, LegalPage, ChatbotKnowledge } from "../../models";
import { crud } from "./crud.factory";

/*
 * Content managed in the admin panel without a developer (proposal: Service & inventory
 * management, Content management, chatbot information).
 */
export const services = crud(Service, { searchFields: ["title", "slug"], slugFrom: "title", defaultSort: "order title" });
export const experiences = crud(Experience, { searchFields: ["name", "slug", "area", "category"], slugFrom: "name", defaultSort: "order name" });
export const packages = crud(HolidayPackage, { searchFields: ["title", "destination", "country"], slugFrom: "title", defaultSort: "order title" });
export const hotels = crud(Hotel, { searchFields: ["name", "area"], defaultSort: "name" });
export const blog = crud(BlogPost, { searchFields: ["title", "category"], slugFrom: "title", defaultSort: "-date" });
export const faqs = crud(Faq, { searchFields: ["q", "category"], defaultSort: "category order" });
export const legal = crud(LegalPage, { searchFields: ["title", "slug"], slugFrom: "title", defaultSort: "title" });
export const knowledge = crud(ChatbotKnowledge, { searchFields: ["title", "content", "category"], defaultSort: "category title" });
