import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemMeta,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  IconArrowRightCircle,
  IconPackage,
  IconShoppingBag,
  IconTags,
  IconUsers,
} from "@tabler/icons-react";

import { StatCard } from "./stat-card";

const products = [
  {
    name: "Golden Beats Headphones",
    price: "$120.00",
    sales: "40 sales",
    image: "https://images.unsplash.com/photo-1545127398-14699f92334b",
  },
  {
    name: "Polaroid Pronto 600 Instant Camera",
    price: "$730.00",
    sales: "40 sales",
    image: "https://images.unsplash.com/photo-1516962126636-27ad087061cc",
  },
  {
    name: "Black Leather Strap Smartwatch",
    price: "$600.00",
    sales: "12 sales",
    image: "https://images.unsplash.com/photo-1549482199-bc1ca6f58502",
  },
  {
    name: "DJI Remote Controller",
    price: "$350.00",
    sales: "21 sales",
    image: "https://images.unsplash.com/photo-1619008054959-921a896885c7",
  },
  {
    name: "PUMA Suede Classic Grey Sneakers",
    price: "$120.00",
    sales: "28 sales",
    image: "https://images.unsplash.com/photo-1605034313761-73ea4a0cfbf3",
  },
];

export function DashboardPage() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<IconShoppingBag />}
          title="Total Sales"
          value="$12,340"
          change="+8.2%"
          changeType="increase"
        />
        <StatCard
          icon={<IconUsers />}
          title="Customers"
          value="3,210"
          change="+4.1%"
          changeType="increase"
        />
        <StatCard
          icon={<IconPackage />}
          title="Orders"
          value="1,520"
          change="-2.3%"
          changeType="decrease"
        />
        <StatCard
          icon={<IconTags />}
          title="Revenue"
          value="$24,580"
          change="+6.9%"
          changeType="increase"
        />
      </div>
      <div className="flex flex-wrap gap-4 lg:flex-nowrap">
        <div className="w-full lg:w-4/12">
          <BestSellingCard />
        </div>
      </div>
    </>
  );
}

function BestSellingCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Best Selling</CardTitle>
      </CardHeader>
      <CardBody>
        <Stack>
          {products.map((product, index) => (
            <div key={product.name}>
              {index > 0 ? <Separator /> : null}
              <Item variant="plain">
                <ItemMedia>
                  <img
                    src={product.image}
                    alt={product.name}
                    className="size-11 rounded object-cover"
                  />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{product.name}</ItemTitle>
                  <ItemDescription>{product.price}</ItemDescription>
                </ItemContent>
                <ItemMeta className="ml-auto shrink-0">
                  {product.sales}
                </ItemMeta>
              </Item>
            </div>
          ))}
        </Stack>
      </CardBody>
      <CardFooter>
        <Button variant="secondary" block size="lg">
          View All <IconArrowRightCircle />
        </Button>
      </CardFooter>
    </Card>
  );
}
