import { Schema, Types, type Query } from "mongoose";

/*
 * Soft delete: a "deleted" record is only marked (deletedAt / deletedBy) and moves to the admin Trash, so it
 * can be restored. Every normal read and update ignores marked records (lists, counts, totals, the customer's
 * My OneVaya), so a deleted record disappears everywhere at once without each query having to remember.
 *
 * To see them anyway: put `deletedAt` in the filter (e.g. { deletedAt: { $ne: null } }) or call
 * `.setOptions({ withDeleted: true })`. Reference numbers use the latter so a number is never reused.
 */
export const softDeleteFields = {
  deletedAt: { type: Date, index: true },
  deletedBy: { type: Types.ObjectId, ref: "User" },
};

type AnyQuery = Query<unknown, unknown> & { getOptions(): { withDeleted?: boolean }; getFilter(): Record<string, unknown> };

export function softDelete(schema: Schema) {
  const hide = function (this: AnyQuery) {
    if (this.getOptions().withDeleted) return;
    if ("deletedAt" in this.getFilter()) return; // the caller asked for them explicitly
    this.where({ deletedAt: null });
  };
  schema.pre(["find", "findOne", "findOneAndUpdate", "countDocuments", "updateOne", "updateMany"], hide);
  schema.pre("aggregate", function () {
    if ((this.options as { withDeleted?: boolean }).withDeleted) return;
    this.pipeline().unshift({ $match: { deletedAt: null } });
  });
}
