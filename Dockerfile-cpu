FROM graphistry/js-and-cpu:7.10.0

WORKDIR /app
COPY . /app
RUN npm install
RUN npm test
WORKDIR /app/examples/convolutionDemo
RUN npm install
WORKDIR /app
CMD bash -c "npm test && cd examples/convolutionDemo && npm start"
