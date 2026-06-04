import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardHeaderAction,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import {
  ArrowRightCircleIcon,
  ArrowRightIcon,
  Package2Icon,
  ShoppingBagIcon,
  TagsIcon,
  Users2Icon,
} from "lucide-react";

import { AppSidebar } from "./app-sidebar";
import { Chart } from "./chart";
import { Layout } from "./layout";
import { StatCard } from "./stat-card";

type DashboardPageProps = {
  userName?: string | null;
  userEmail?: string | null;
};

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

const orders = [
  {
    id: "5678",
    customer: "Jessica Pearson",
    date: "2025-06-01",
    total: "$532.44",
    status: "Completed",
    variant: "success",
  },
  {
    id: "5683",
    customer: "Michael Ross",
    date: "2025-06-02",
    total: "$89.99",
    status: "Pending",
    variant: "warning",
  },
  {
    id: "5690",
    customer: "Rachel Zane",
    date: "2025-06-04",
    total: "$250.00",
    status: "Canceled",
    variant: "danger",
  },
  {
    id: "5765",
    customer: "Harvey Specter",
    date: "2025-06-06",
    total: "$1,732.10",
    status: "Completed",
    variant: "success",
  },
  {
    id: "5892",
    customer: "Donna Paulsen",
    date: "2025-06-08",
    total: "$423.67",
    status: "Processing",
    variant: "info",
  },
  {
    id: "5921",
    customer: "Larry Litt",
    date: "2025-06-09",
    total: "$205.49",
    status: "Pending",
    variant: "warning",
  },
  {
    id: "6002",
    customer: "Katrina Bennett",
    date: "2025-06-10",
    total: "$1,225.00",
    status: "Completed",
    variant: "success",
  },
] as const;

export function DashboardPage({ userName, userEmail }: DashboardPageProps) {
  return (
    <Layout sidebar={<AppSidebar userName={userName} userEmail={userEmail} />}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<ShoppingBagIcon />}
          title="Total Sales"
          value="$12,340"
          change="+8.2%"
          changeType="increase"
        />
        <StatCard
          icon={<Users2Icon />}
          title="Customers"
          value="3,210"
          change="+4.1%"
          changeType="increase"
        />
        <StatCard
          icon={<Package2Icon />}
          title="Orders"
          value="1,520"
          change="-2.3%"
          changeType="decrease"
        />
        <StatCard
          icon={<TagsIcon />}
          title="Revenue"
          value="$24,580"
          change="+6.9%"
          changeType="increase"
        />
      </div>
      <div className="flex flex-wrap gap-4 lg:flex-nowrap">
        <div className="w-full lg:w-8/12">
          <Chart />
        </div>
        <div className="w-full lg:w-4/12">
          <BestSellingCard />
        </div>
      </div>
      <RecentOrdersCard />
    </Layout>
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
                <ItemMeta className="ml-auto shrink-0">{product.sales}</ItemMeta>
              </Item>
            </div>
          ))}
        </Stack>
      </CardBody>
      <CardFooter>
        <Button variant="secondary" block size="lg">
          View All <ArrowRightCircleIcon />
        </Button>
      </CardFooter>
    </Card>
  );
}

function RecentOrdersCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Orders</CardTitle>
        <CardHeaderAction>
          <Button variant="secondary">
            View All <ArrowRightIcon />
          </Button>
        </CardHeaderAction>
      </CardHeader>
      <CardBody>
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Text className="text-muted">{order.id}</Text>
                  </TableCell>
                  <TableCell>{order.customer}</TableCell>
                  <TableCell>{order.date}</TableCell>
                  <TableCell>{order.total}</TableCell>
                  <TableCell>
                    <Badge variant={order.variant}>{order.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardBody>
    </Card>
  );
}
