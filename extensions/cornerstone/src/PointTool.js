import csTools from 'cornerstone-tools';
const BaseAnnotationTool = csTools.importInternal('base/BaseAnnotationTool');
// Drawing
const getNewContext = csTools.importInternal('drawing/getNewContext');
const draw = csTools.importInternal('drawing/draw');
const drawTextBox = csTools.importInternal('drawing/drawTextBox');
const drawHandles = csTools.importInternal('drawing/drawHandles');
// Utilities
const getRGBPixels = csTools.importInternal('util/getRGBPixels');
const calculateSUV = csTools.importInternal('util/calculateSUV');
const getLogger = csTools.importInternal('util/getLogger');
const throttle = csTools.importInternal('util/throttle');
const logger = getLogger('tools:annotation:ProbeTool');

/**
 * @public
 * @class ProbeTool
 * @memberof Tools.Annotation
 * @classdesc Tool which provides a probe of the image data at the
 * desired position.
 * @extends Tools.Base.BaseAnnotationTool
 */
export default class PointTool extends BaseAnnotationTool {
  constructor(props = {}) {
    const defaultProps = {
      name: 'Point',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      // svgCursor: probeCursor,
      configuration: {
        drawHandles: true,
        renderDashed: false,
      },
    };

    super(defaultProps);

    this.throttledUpdateCachedStats = throttle(this.updateCachedStats, 110);
  }

  createNewMeasurement(eventData) {
    const goodEventData =
      eventData && eventData.currentPoints && eventData.currentPoints.image;

    if (!goodEventData) {
      logger.error(
        `required eventData not supplied to tool ${this.name}'s createNewMeasurement`
      );

      return;
    }

    return {
      visible: true,
      active: true,
      color: undefined,
      invalidated: true,
      handles: {
        end: {
          x: eventData.currentPoints.image.x,
          y: eventData.currentPoints.image.y,
          highlight: true,
          active: true,
          annotation: '',
        },
      },
    };
  }

  /**
   *
   *
   * @param {*} element
   * @param {*} data
   * @param {*} coords
   * @returns {Boolean}
   */
  pointNearTool(element, data, coords) {
    const hasEndHandle = data && data.handles && data.handles.end;
    const validParameters = hasEndHandle;

    if (!validParameters) {
      logger.warn(
        `invalid parameters supplied to tool ${this.name}'s pointNearTool`
      );
    }

    if (!validParameters || data.visible === false) {
      return false;
    }

    const probeCoords = csTools.external.cornerstone.pixelToCanvas(
      element,
      data.handles.end
    );

    return (
      csTools.external.cornerstoneMath.point.distance(probeCoords, coords) < 5
    );
  }

  updateCachedStats(image, element, data) {
    const x = Math.round(data.handles.end.x);
    const y = Math.round(data.handles.end.y);

    const stats = {};

    if (x >= 0 && y >= 0 && x < image.columns && y < image.rows) {
      stats.x = x;
      stats.y = y;

      if (image.color) {
        stats.storedPixels = getRGBPixels(element, x, y, 1, 1);
      } else {
        stats.storedPixels = csTools.external.cornerstone.getStoredPixels(
          element,
          x,
          y,
          1,
          1
        );
        stats.sp = stats.storedPixels[0];
        stats.mo = stats.sp * image.slope + image.intercept;
        stats.suv = calculateSUV(image, stats.sp);
      }
    }

    data.cachedStats = stats;
    data.invalidated = false;
  }

  doubleClickCallback(evt) {
    const element = evt.detail.element;
    const coords = evt.detail.currentPoints.canvas;
    const toolState = csTools.getToolState(element, this.name);
    let annotateString = prompt('Enter your annotation');
    for (let i = 0; i < toolState.data.length; i++) {
      const data = toolState.data[i];
      if (this.pointNearTool(element, data, coords)) {
        data.handles.end.annotation = annotateString;
        return true;
      }
    }
  }

  renderToolData(evt) {
    const eventData = evt.detail;
    const { handleRadius, renderDashed } = this.configuration;
    const toolData = csTools.getToolState(evt.currentTarget, this.name);

    if (!toolData) {
      return;
    }
    // We have tool data for this element - iterate over each one and draw it
    const context = getNewContext(eventData.canvasContext.canvas);
    const { image, element } = eventData;
    const fontHeight = csTools.textStyle.getFontSize();
    const lineDash = csTools.getModule('globalConfiguration').configuration
      .lineDash;

    for (let i = 0; i < toolData.data.length; i++) {
      const data = toolData.data[i];

      if (data.visible === false) {
        continue;
      }

      draw(context, context => {
        const color = csTools.toolColors.getColorIfActive(data);

        if (this.configuration.drawHandles) {
          // Draw the handles
          let handleOptions = { handleRadius, color };

          if (renderDashed) {
            handleOptions.lineDash = lineDash;
          }

          drawHandles(context, eventData, data.handles, handleOptions);
        }

        // Update textbox stats
        if (data.invalidated === true) {
          if (data.cachedStats) {
            this.throttledUpdateCachedStats(image, element, data);
          } else {
            this.updateCachedStats(image, element, data);
          }
        }

        let text, str;

        const { x, y, storedPixels, sp, mo, suv } = data.cachedStats;
        // console.log(x,y);
        if (x >= 0 && y >= 0 && x < image.columns && y < image.rows) {
          text = `${x}, ${y}`;

          if (image.color) {
            str = `R: ${storedPixels[0]} G: ${storedPixels[1]} B: ${
              storedPixels[2]
            }`;
          } else {
            // Draw text
            str = `SP: ${sp} MO: ${parseFloat(mo.toFixed(3))}`;
            if (suv) {
              str += ` SUV: ${parseFloat(suv.toFixed(3))}`;
            }
          }

          // Coords for text
          const coords = {
            // Translate the x/y away from the cursor
            x: data.handles.end.x + 3,
            y: data.handles.end.y - 3,
          };
          const textCoords = csTools.external.cornerstone.pixelToCanvas(
            eventData.element,
            coords
          );

          drawTextBox(
            context,
            str,
            textCoords.x,
            textCoords.y + fontHeight + 5,
            color
          );
          drawTextBox(
            context,
            text,
            textCoords.x,
            textCoords.y + fontHeight + 20,
            color
          );
          drawTextBox(
            context,
            data.handles.end.annotation,
            textCoords.x,
            textCoords.y,
            color
          );
        }
      });
    }
  }
}
