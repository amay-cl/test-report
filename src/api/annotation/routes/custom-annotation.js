module.exports = {
    routes: [
      {
        // Path defined with a URL parameter
        method: "GET",
        path: "/annotation/getpdf",
        handler: "annotation.getpdf",
        config: {
          auth: false,
        },
      },
      {
        // Path defined with a URL parameter
        method: "GET",
        path: "/annotation/getDetailedReport",
        handler: "annotation.getDetailedReport",
        config: {
          auth: false,
        },
      },
  
  
    ],
  };
  