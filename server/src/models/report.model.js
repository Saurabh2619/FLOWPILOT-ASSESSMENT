import mongoose from 'mongoose';

const { Mixed, ObjectId } = mongoose.Schema.Types;

const reportSchema = new mongoose.Schema(
  {
    runId: { type: ObjectId, ref: 'Run', required: true, unique: true },
    websiteId: { type: ObjectId, ref: 'Website', required: true, index: true },
    userId: { type: ObjectId, ref: 'User', required: true },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    categoryScores: { type: Mixed, required: true },
    issues: { type: [Mixed], default: [] },
    site: { type: Mixed, required: true },
    pages: { type: [Mixed], default: [] },
    brokenLinks: { type: [Mixed], default: [] },
  },
  { timestamps: true, suppressReservedKeysWarning: true },
);

reportSchema.methods.toPublic = function toPublic() {
  const { overallScore, categoryScores, issues, site, pages, brokenLinks, createdAt } = this;
  return {
    id: this.id,
    runId: String(this.runId),
    overallScore,
    categoryScores,
    issues,
    site,
    pages,
    brokenLinks,
    createdAt,
  };
};

export const Report = mongoose.model('Report', reportSchema);
