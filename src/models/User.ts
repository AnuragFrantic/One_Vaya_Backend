import { Schema, model, InferSchemaType, HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES } from "../config/constants";

/** Customers, staff and admins share one collection, separated by `role`. */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    nationality: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: "customer", index: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
  },
  { timestamps: true },
);

userSchema.methods.checkPassword = function (this: { passwordHash: string }, plain: string) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = (plain: string) => bcrypt.hash(plain, 12);

/** Never leak secrets in JSON responses. */
userSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    delete ret.__v;
    return ret;
  },
});

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs> & { checkPassword(plain: string): Promise<boolean> };

export const User = model("User", userSchema);
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
