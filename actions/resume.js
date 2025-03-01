"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { revalidatePath } from "next/cache";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export async function saveResume(content) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) throw new Error("User not found");

  try {
    const resume = await db.resume.upsert({
      where: { userId: user.id },
      update: { content },
      create: { userId: user.id, content },
    });

    revalidatePath("/resume");
    return resume;
  } catch (error) {
    console.error("Error saving resume:", error);
    throw new Error("Failed to save resume");
  }
}

export async function getResume() {
  const { userId } = await auth();
  if (!userId) {
    console.error("No user ID found in authentication");
    throw new Error("Unauthorized");
  }

  console.log("Fetching user with clerkUserId:", userId); // Log userId

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
  });

  if (!user) {
    console.error("User not found in the database for clerkUserId:", userId); // Log the clerkUserId for debugging
    throw new Error("User not found");
  }

  console.log("User found:", user); // Log found user information

  return await db.resume.findUnique({
    where: {
      userId: user.id,
    },
  });
}


export async function improveWithAI({ current, type }) {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");

  const user = await db.user.findUnique({
    where: { clerkUserId: userId },
    include: { industryInsight: true },
  });

  if (!user) throw new Error("User not found");

  const prompt = `
    As an expert resume writer, improve the following ${type} description for a ${user.industry} professional.
    Make it more impactful, quantifiable, and aligned with industry standards.
    Current content: "${current}"

    Requirements:
    - Use action verbs
    - Include metrics and results where possible
    - Highlight relevant technical skills
    - Keep it concise but detailed
    - Focus on achievements over responsibilities
    - Use industry-specific keywords

    Format the response as a single paragraph without any additional text or explanations.
  `.trim();

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const improvedContent = response.text(); // Ensure correct extraction

    return improvedContent.trim();
  } catch (error) {
    console.error("Error improving content:", error);
    throw new Error("Failed to improve content");
  }
}
