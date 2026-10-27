import {prisma} from '../config/prisma.js';
import {optimizeCloudinaryUrl} from '../services/image.service.js';

export const catalogRepository={
  categories: async () => {
    const list = await prisma.category.findMany({where:{status:'ACTIVE'},orderBy:{position:'asc'}});
    return list.map(c => ({
      ...c,
      image: optimizeCloudinaryUrl(c.image, { width: 400 })
    }));
  },
  products: args => prisma.product.findMany(args),
  product: id => prisma.product.findFirst({
    where:{OR:[{id},{slug:id}],deletedAt:null,status:'ACTIVE'},
    include:{category:true,ratings:true,images:{orderBy:{position:'asc'}}}
  }),
  banners: async () => {
    const list = await prisma.banner.findMany({where:{status:'ACTIVE'},orderBy:{position:'asc'}});
    return list.map(b => ({
      ...b,
      image: optimizeCloudinaryUrl(b.image, { width: 1200 })
    }));
  }
};
