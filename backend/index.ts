import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import cors from "cors";

const prisma = new PrismaClient();

dotenv.config();

const port = process.env.PORT || 3000;

const app: Express = express();
app.use(express.json());
app.use(cors());

// Upsert pricing
app.post("/api/v1/price", async (req: Request, res: Response) => {
  const { customer_id, product_id, price } = req.body;

  try {
    const result = await prisma.$transaction(async () => {
      const previousPricing = await prisma.pricing.findFirst({
        where: { product_id, customer_id },
        orderBy: { effective_date: "desc" },
      });

      let newPricing;

      if (!previousPricing) {
        newPricing = await prisma.pricing.create({
          data: { product_id, customer_id, price },
        });
      } else {
        newPricing = await prisma.pricing.update({
          where: { pricing_id: previousPricing.pricing_id },
          data: { price },
        });

        if (previousPricing.price === price) {
          return res.status(400).json({
            message: "Price could not be the same as the previous price",
          });
        }
      }

      const pricingHistory = await prisma.priceHistory.create({
        data: {
          pricing_id: newPricing.pricing_id,
          previous_price: previousPricing ? previousPricing.price : 0,
          updated_price: newPricing.price,
        },
      });

      return { newPricing, pricingHistory };
    });

    res
      .status(201)
      .json({ message: "Pricing successfully added!", data: result });
  } catch (e) {
    console.error("Insert failed " + e);
    res.status(500).json({ error: "Insert failed " + e });
  }
});

// Get active price
app.get("/api/v1/price", async (req: Request, res: Response) => {
  const { product_id, customer_id } = req.query;
  const query: Record<string, unknown> = {};

  if (product_id) query["product_id"] = product_id;
  if (customer_id) query["customer_id"] = customer_id;

  try {
    const prices = await prisma.pricing.findMany({
      where: query,
      include: { customer: true, product: true },
    });

    res.status(200).json({
      data: prices,
    });
  } catch (e) {
    console.error("Get failed " + e);
    res.status(500).json({ error: "Get failed " + e });
  }
});

// Get price history
app.get(
  "/api/v1/price-history/:pricing_id",
  async (req: Request, res: Response) => {
    const { pricing_id } = req.params;

    try {
      const histories = await prisma.priceHistory.findMany({
        where: { pricing_id },
      });

      res.status(200).json({
        data: histories,
      });
    } catch (e) {
      console.error("Get failed " + e);
      res.status(500).json({ error: "Get failed " + e });
    }
  }
);

app.get("/api/v1/customers", async (req: Request, res: Response) => {
  try {
    const customers = await prisma.customer.findMany();
    console.log(customers);
    res.status(200).json({ data: customers });
  } catch (e) {
    console.error("Get failed " + e);
    res.status(500).json({ error: "Get failed " + e });
  }
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
