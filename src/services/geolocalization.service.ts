import { Request } from 'express';
import WhichBrowser from 'which-browser';
import type API from '../types/index.js';
import Utility from '../utils/index.js';

const IPServicesList = [
  {
    host: 'https://free.freeipapi.com/api/json/{ip}',
    map: {
      countryName: 'country',
      cityName: 'city',
    },
  },
  {
    host: 'https://ipwho.is/{ip}',
    map: {
      country: 'country',
      city: 'city',
    },
  },
  {
    host: 'https://ipapi.co/{ip}/json',
    map: {
      country_name: 'country',
      city: 'city',
    },
  },
  {
    host: 'https://freeipapi.com/api/json/{ip}',
    map: {
      countryName: 'country',
      cityName: 'city',
    },
  },
];

class GeolocalizationService {
  private async getIPDetails(ip: string) {
    try {
      let currentIndex = 1;

      const result: Record<string, string> = {};

      for (const service of IPServicesList) {
        const host = service.host.replace('{ip}', ip);
        const res = await fetch(host);

        if (res.status !== 200 && currentIndex === IPServicesList.length) {
          throw 'THIRDY_PARTY_ERROR_IP_DETAILS';
        }

        if (res.status === 200) {
          const data = (await res.json()) as Record<string, string>;

          for (const [key, value] of Object.entries(service.map)) {
            result[value] = data[key];
          }

          break;
        }

        currentIndex++;
      }

      if (!result.country) {
        throw 'THIRDY_PARTY_ERROR_IP_DETAILS';
      }

      return result;
    } catch (error) {
      Utility.Logger.error(`Error fetching IP details:`, error);
      return;
    }
  }

  public async retrieveVisitor(ip: string, req: Request) {
    try {
      const ipDetails = await this.getIPDetails(ip);

      const requestDetails = new WhichBrowser(req.headers);

      const result = {} as API.VisitorDetails;

      result.browser = requestDetails.browser.toString();
      result.ip = ip;
      result.os = requestDetails.os.toString();
      result.isMobile = requestDetails.getType() !== 'desktop';

      if (ipDetails) {
        result.ipLocation = ipDetails as API.VisitorDetails['ipLocation'];
      }

      return result;
    } catch (error) {
      Utility.Logger.error(`Error fetching visitor details:`, error);
      return;
    }
  }
}

export default new GeolocalizationService();
